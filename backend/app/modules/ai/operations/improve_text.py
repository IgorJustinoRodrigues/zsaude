"""Operation: polir texto. Útil pra notas clínicas, nome social, descrições."""

from __future__ import annotations

import time
from typing import Any, Literal

from pydantic import Field

from app.core.schema_base import CamelModel as BaseModel
from app.modules.ai.operations.base import AIOperation
from app.modules.ai.providers.base import ChatMessage, ChatRequest
from app.modules.ai.service import AIService

Style = Literal["formal", "neutral", "concise", "friendly"]


class ImproveTextInput(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    style: Style = "neutral"
    # Idioma alvo ISO 639-1. Default: manter original (pt-BR assumido).
    language: str = "pt-BR"


class ImproveTextOutput(BaseModel):
    improved_text: str
    changed: bool  # False se o texto já estava bom


_SYSTEM_PROMPT = """\
Você é um revisor de textos que escreve em português brasileiro claro e natural.
Sua tarefa é melhorar o texto do usuário sem alterar o sentido, adequando ao estilo pedido:
- formal: linguagem corporativa, sem gírias
- neutral: correção gramatical, clareza, sem mudar tom
- concise: resumir mantendo informação essencial
- friendly: tom caloroso mas profissional

Mantenha nomes próprios, termos clínicos, CPF, CNS e datas exatamente como estão.
Se o texto já estiver adequado, devolva-o inalterado e indique "changed": false.
Responda APENAS com JSON no formato {"improved_text": "...", "changed": true|false}.
"""


class ImproveText(AIOperation[ImproveTextInput, ImproveTextOutput]):
    slug = "improve_text"
    capability = "chat"
    prompt_slug = "improve_text"
    prompt_version = 1

    input_model = ImproveTextInput
    output_model = ImproveTextOutput

    @classmethod
    async def _run(
        cls,
        service: AIService,
        input_dto: ImproveTextInput,
        *,
        module_code: str,
        idempotency_key: str | None,
    ) -> tuple[ImproveTextOutput, dict[str, Any]]:
        # Carrega prompt do banco (editável em /sys/ia → Instruções) com
        # fallback pro hardcoded se não encontrar.
        from app.modules.ai.prompt_loader import load_prompt
        system = await load_prompt(
            service.db, cls.prompt_slug, cls.prompt_version,
            fallback=_SYSTEM_PROMPT,
        ) or _SYSTEM_PROMPT

        req = ChatRequest(
            messages=[
                ChatMessage(role="system", content=system),
                ChatMessage(
                    role="user",
                    content=f"Estilo: {input_dto.style}\nIdioma: {input_dto.language}\n\nTexto:\n{input_dto.text}",
                ),
            ],
            temperature=0.2,
            response_schema={
                "type": "object",
                "additionalProperties": False,
                "required": ["improved_text", "changed"],
                "properties": {
                    "improved_text": {"type": "string"},
                    "changed": {"type": "boolean"},
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

        import json

        try:
            parsed = json.loads(resp.text or "{}")
        except json.JSONDecodeError:
            # Fallback defensivo: se o modelo não respeitou JSON, trata como
            # texto puro sem mudança relevante.
            parsed = {"improved_text": resp.text or input_dto.text, "changed": False}

        output = ImproveTextOutput(
            improved_text=str(parsed.get("improved_text", input_dto.text) or input_dto.text),
            changed=bool(parsed.get("changed", False)),
        )
        usage = {
            "tokens_in": resp.tokens_in,
            "tokens_out": resp.tokens_out,
            "latency_ms": latency_ms,
        }
        return output, usage
