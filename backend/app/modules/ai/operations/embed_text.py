"""Operation: gerar embeddings de texto (busca semântica)."""

from __future__ import annotations

import time
from typing import Any

from pydantic import Field

from app.core.schema_base import CamelModel as BaseModel
from app.modules.ai.operations.base import AIOperation
from app.modules.ai.providers.base import EmbedRequest
from app.modules.ai.service import AIService


class EmbedTextInput(BaseModel):
    inputs: list[str] = Field(min_length=1, max_length=100)
    dimensions: int | None = None  # alguns modelos aceitam reduzir


class EmbedTextOutput(BaseModel):
    vectors: list[list[float]]
    dim: int


class EmbedText(AIOperation[EmbedTextInput, EmbedTextOutput]):
    slug = "embed_text"
    capability = "embed_text"
    prompt_slug = ""  # embeddings não usam prompt
    prompt_version = 0

    input_model = EmbedTextInput
    output_model = EmbedTextOutput

    @classmethod
    async def _run(
        cls,
        service: AIService,
        input_dto: EmbedTextInput,
        *,
        module_code: str,
        idempotency_key: str | None,
    ) -> tuple[EmbedTextOutput, dict[str, Any]]:
        req = EmbedRequest(inputs=input_dto.inputs, dimensions=input_dto.dimensions)

        start = time.monotonic()
        resp = await service.call_embed(
            req,
            capability=cls.capability,
            module_code=module_code,
            operation_slug=cls.slug,
            idempotency_key=idempotency_key,
        )
        latency_ms = int((time.monotonic() - start) * 1000)

        dim = len(resp.vectors[0]) if resp.vectors else 0
        return (
            EmbedTextOutput(vectors=resp.vectors, dim=dim),
            {"tokens_in": resp.tokens_in, "tokens_out": 0, "latency_ms": latency_ms},
        )
