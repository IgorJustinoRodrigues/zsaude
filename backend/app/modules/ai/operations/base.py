"""Base de operations do gateway de IA.

Cada operation encapsula:
- slug (identifica a operação no log e nos endpoints)
- capability exigida (chat/chat_vision/embed_text/...)
- prompt template (slug + version pra rastreabilidade)
- InputDTO/OutputDTO (pydantic, validação + serialização)
- lógica de montar ChatRequest/EmbedRequest e parsear resposta

Módulos consumidores chamam ``await MinhaOperation.run(service, inputs, ...)``.
"""

from __future__ import annotations

from typing import Any, ClassVar, Generic, TypeVar

from pydantic import BaseModel

from app.modules.ai.service import AIService

InT = TypeVar("InT", bound=BaseModel)
OutT = TypeVar("OutT", bound=BaseModel)


class AIOperation(Generic[InT, OutT]):
    """Contrato que cada operation concreta implementa."""

    slug: ClassVar[str] = ""            # ex: "improve_text"
    capability: ClassVar[str] = "chat"  # "chat"|"chat_vision"|"embed_text"
    prompt_slug: ClassVar[str] = ""     # pra rastrear no log
    prompt_version: ClassVar[int] = 1

    input_model: ClassVar[type[BaseModel]]
    output_model: ClassVar[type[BaseModel]]

    @classmethod
    async def run(
        cls,
        service: AIService,
        inputs: dict[str, Any] | BaseModel,
        *,
        module_code: str,
        idempotency_key: str | None = None,
    ) -> tuple[BaseModel, dict[str, Any]]:
        """Executa a operação. Retorna (output_dto, usage_meta)."""
        # Valida input
        if isinstance(inputs, BaseModel):
            input_dto = inputs
        else:
            input_dto = cls.input_model.model_validate(inputs)  # type: ignore[assignment]
        return await cls._run(service, input_dto, module_code=module_code, idempotency_key=idempotency_key)

    @classmethod
    async def _run(
        cls,
        service: AIService,
        input_dto: BaseModel,
        *,
        module_code: str,
        idempotency_key: str | None,
    ) -> tuple[BaseModel, dict[str, Any]]:
        raise NotImplementedError
