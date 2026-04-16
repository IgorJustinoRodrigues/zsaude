"""Operation: sumarizar texto longo."""

from __future__ import annotations

import json
import time
from typing import Any

from pydantic import Field

from app.core.schema_base import CamelModel as BaseModel
from app.modules.ai.operations.base import AIOperation
from app.modules.ai.providers.base import ChatMessage, ChatRequest
from app.modules.ai.service import AIService


class SummarizeInput(BaseModel):
    text: str = Field(min_length=1, max_length=32000)
    max_words: int = Field(default=150, ge=20, le=800)
    # Contexto livre pro modelo (ex: "evolução de consulta pediátrica").
    context: str = ""


class SummarizeOutput(BaseModel):
    summary: str


_SYSTEM = """\
Você é um sumarizador. Resuma o texto em português brasileiro, mantendo fatos
e cifras importantes. Não invente dados. Respeite o limite de palavras solicitado.
Responda APENAS com JSON {"summary": "..."}.
"""


class Summarize(AIOperation[SummarizeInput, SummarizeOutput]):
    slug = "summarize"
    capability = "chat"
    prompt_slug = "summarize"
    prompt_version = 1

    input_model = SummarizeInput
    output_model = SummarizeOutput

    @classmethod
    async def _run(
        cls,
        service: AIService,
        input_dto: SummarizeInput,
        *,
        module_code: str,
        idempotency_key: str | None,
    ) -> tuple[SummarizeOutput, dict[str, Any]]:
        ctx_line = f"\nContexto: {input_dto.context}" if input_dto.context else ""
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
                    content=f"Limite: {input_dto.max_words} palavras.{ctx_line}\n\nTexto:\n{input_dto.text}",
                ),
            ],
            temperature=0.2,
            response_schema={
                "type": "object",
                "additionalProperties": False,
                "required": ["summary"],
                "properties": {"summary": {"type": "string"}},
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
            summary = str(parsed.get("summary", resp.text or ""))
        except json.JSONDecodeError:
            summary = resp.text or ""

        return (
            SummarizeOutput(summary=summary),
            {"tokens_in": resp.tokens_in, "tokens_out": resp.tokens_out, "latency_ms": latency_ms},
        )
