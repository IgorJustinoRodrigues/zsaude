"""Operation: classificar texto em N labels."""

from __future__ import annotations

import json
import time
from typing import Any

from pydantic import Field

from app.core.schema_base import CamelModel as BaseModel
from app.modules.ai.operations.base import AIOperation
from app.modules.ai.providers.base import ChatMessage, ChatRequest
from app.modules.ai.service import AIService


class ClassifyInput(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    labels: list[str] = Field(min_length=2, max_length=20)
    allow_other: bool = True  # se True, modelo pode devolver "OUTRO"


class ClassifyOutput(BaseModel):
    label: str
    confidence: float  # 0.0-1.0


_SYSTEM = """\
Você é um classificador. Dado um texto e uma lista de rótulos possíveis,
escolha o rótulo mais adequado. Retorne APENAS JSON:
{"label": "...", "confidence": 0.0}. Confidence é a probabilidade estimada
(0.0-1.0). Se nenhum rótulo se aplicar e OUTRO for permitido, use "OUTRO".
"""


class Classify(AIOperation[ClassifyInput, ClassifyOutput]):
    slug = "classify"
    capability = "chat"
    prompt_slug = "classify"
    prompt_version = 1

    input_model = ClassifyInput
    output_model = ClassifyOutput

    @classmethod
    async def _run(
        cls,
        service: AIService,
        input_dto: ClassifyInput,
        *,
        module_code: str,
        idempotency_key: str | None,
    ) -> tuple[ClassifyOutput, dict[str, Any]]:
        labels_str = ", ".join(input_dto.labels)
        extras = " OUTRO" if input_dto.allow_other else ""
        from app.modules.ai.prompt_loader import load_prompt
        system = await load_prompt(
            service.db, cls.prompt_slug, cls.prompt_version,
            fallback=_SYSTEM,
        ) or _SYSTEM
        req = ChatRequest(
            messages=[
                ChatMessage(role="system", content=system),
                ChatMessage(
                    role="user",
                    content=f"Rótulos permitidos: [{labels_str}{extras}]\n\nTexto:\n{input_dto.text}",
                ),
            ],
            temperature=0.0,
            response_schema={
                "type": "object",
                "additionalProperties": False,
                "required": ["label", "confidence"],
                "properties": {
                    "label": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
        )

        start = time.monotonic()
        resp = await service.call_chat(
            req,
            capability=cls.capability,
            module_code=module_code,
            operation_slug=cls.slug,
            prompt_template=(cls.prompt_slug, cls.prompt_version),
            idempotency_key=idempotency_key,
        )
        latency_ms = int((time.monotonic() - start) * 1000)

        try:
            parsed = json.loads(resp.text or "{}")
            label = str(parsed.get("label", "OUTRO"))
            confidence = float(parsed.get("confidence", 0.0))
        except (json.JSONDecodeError, ValueError):
            label = "OUTRO"
            confidence = 0.0

        return (
            ClassifyOutput(label=label, confidence=max(0.0, min(1.0, confidence))),
            {"tokens_in": resp.tokens_in, "tokens_out": resp.tokens_out, "latency_ms": latency_ms},
        )
