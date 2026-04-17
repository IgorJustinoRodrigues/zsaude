"""Pydantic DTOs do módulo AI (camelCase JSON / snake_case Python)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


# ─── Consumo (request/response das operations) ────────────────────────────────


class AIOperationRequest(CamelModel):
    """Request genérico pra endpoints ``/ai/operations/*``.

    Cada operation declara seu próprio formato de ``inputs``. O service
    só inspeciona ``moduleCode`` e ``idempotencyKey``.
    """

    inputs: dict[str, Any]
    module_code: str = Field(min_length=1, max_length=20)
    idempotency_key: str | None = Field(default=None, max_length=80)


class AIUsageMeta(CamelModel):
    """Metadata retornada junto com a resposta da operation."""

    operation_slug: str
    provider_slug: str
    model_slug: str
    tokens_in: int
    tokens_out: int
    total_cost_cents: float
    latency_ms: int


class AIOperationResponse(CamelModel):
    """Envelope padrão. ``output`` é tipado por operation — aqui é dict opaco."""

    output: dict[str, Any]
    usage: AIUsageMeta


# ─── Admin (SYS) ──────────────────────────────────────────────────────────────


class AIProviderRead(CamelModel):
    id: UUID
    slug: str
    display_name: str
    sdk_kind: Literal["openai", "openrouter", "anthropic", "ollama"]
    base_url_default: str
    capabilities: list[str]
    active: bool


class AIProviderWrite(CamelModel):
    slug: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9_-]+$")
    display_name: str = Field(min_length=1, max_length=120)
    sdk_kind: Literal["openai", "openrouter", "anthropic", "ollama"]
    base_url_default: str = ""
    capabilities: list[str] = Field(default_factory=list)
    active: bool = True


class AIModelRead(CamelModel):
    id: UUID
    provider_id: UUID
    provider_slug: str
    slug: str
    display_name: str
    capabilities: list[str]
    input_cost_per_mtok: int
    output_cost_per_mtok: int
    max_context: int | None
    active: bool


class AIModelWrite(CamelModel):
    provider_id: UUID
    slug: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=160)
    capabilities: list[str] = Field(default_factory=list)
    input_cost_per_mtok: int = 0
    output_cost_per_mtok: int = 0
    max_context: int | None = None
    active: bool = True


class AIPromptTemplateRead(CamelModel):
    id: UUID
    slug: str
    version: int
    body: str
    response_schema: dict[str, Any] | None
    description: str
    active: bool


class AIPromptTemplateWrite(CamelModel):
    slug: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9_.-]+$")
    version: int = Field(ge=1, default=1)
    body: str = Field(min_length=1)
    response_schema: dict[str, Any] | None = None
    description: str = ""
    active: bool = True


class AICapabilityRouteRead(CamelModel):
    id: UUID
    scope: Literal["global", "municipality", "module"]
    municipality_id: UUID | None
    module_code: str | None
    capability: str
    model_id: UUID
    model_slug: str
    provider_slug: str
    priority: int
    active: bool


class AICapabilityRouteWrite(CamelModel):
    scope: Literal["global", "municipality", "module"]
    municipality_id: UUID | None = None
    module_code: str | None = None
    capability: str = Field(min_length=1, max_length=30)
    model_id: UUID
    priority: int = 0
    active: bool = True


# ─── Admin (OPS) — chaves por município ───────────────────────────────────────


class AIMunicipalityKeyRead(CamelModel):
    """Nunca devolve a chave — só o suficiente pra identificar.

    ``municipality_id`` None = chave global (padrão). Preenchida = personalização.
    """

    id: UUID
    municipality_id: UUID | None = None
    provider_id: UUID
    provider_slug: str
    configured: bool
    key_fingerprint: str
    key_last4: str
    base_url_override: str
    rotated_at: datetime | None
    active: bool


class AIMunicipalityKeyWrite(CamelModel):
    provider_id: UUID
    # Opcional: se None/"", preserva a chave atual (útil pra editar só base_url).
    api_key: str | None = None
    base_url_override: str = ""
    active: bool = True


class AIKeyTestRequest(CamelModel):
    provider_id: UUID


class AIKeyTestResponse(CamelModel):
    ok: bool
    detail: str = ""


class AIQuotaRead(CamelModel):
    """``municipality_id`` None = quota global (padrão)."""

    id: UUID
    municipality_id: UUID | None = None
    period: str
    max_tokens: int
    max_cost_cents: int
    max_requests: int
    max_per_user_tokens: int
    active: bool


class AIQuotaWrite(CamelModel):
    max_tokens: int = 0
    max_cost_cents: int = 0
    max_requests: int = 0
    max_per_user_tokens: int = 0
    active: bool = True


# ─── Log de consumo ───────────────────────────────────────────────────────────


class AIUsageLogRead(CamelModel):
    id: UUID
    at: datetime
    municipality_id: UUID | None
    user_id: UUID | None
    module_code: str
    operation_slug: str
    capability: str
    provider_slug: str
    model_slug: str
    tokens_in: int
    tokens_out: int
    total_cost_cents: float
    latency_ms: int
    success: bool
    error_code: str
    error_message: str


class AIUsageSummary(CamelModel):
    """Agregação (pra cards de dashboard)."""

    requests: int
    tokens_in: int
    tokens_out: int
    total_cost_cents: float
    success_count: int
    failure_count: int


class AIUsageListResponse(CamelModel):
    items: list[AIUsageLogRead]
    total: int
    page: int
    page_size: int
