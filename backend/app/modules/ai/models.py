"""Modelos do Gateway de IA (schema ``app``).

Catálogo global (providers, models, prompts), configuração por município
(keys, routes, quotas) e log de consumo particionado mensalmente.

Capabilities são strings (não enum) pra permitir extensão sem migration.
Valores canônicos: ``chat``, ``chat_vision``, ``embed_text``,
``embed_image``, ``transcribe``.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import new_uuid7


# ─── Enums ────────────────────────────────────────────────────────────────────


class AISdkKind(str, enum.Enum):
    """Família de SDK/protocolo do provider — define qual adapter usar."""

    openai = "openai"            # API OpenAI-compatible (também OpenRouter)
    openrouter = "openrouter"    # OpenAI-compatible mas rotas/cabeçalhos próprios
    anthropic = "anthropic"      # Messages API nativa (entra na F2)
    ollama = "ollama"            # /api/chat e /api/embed locais


class AIRouteScope(str, enum.Enum):
    """Escopo da rota: menor escopo ganha na resolução (module > municipality > global)."""

    global_ = "global"
    municipality = "municipality"
    module = "module"


# ─── Catálogo global ──────────────────────────────────────────────────────────


class AIProvider(Base, TimestampedMixin):
    """Catálogo de provedores suportados (gerenciado pelo SYS)."""

    __tablename__ = "ai_providers"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    sdk_kind: Mapped[AISdkKind] = mapped_column(
        Enum(AISdkKind, name="ai_sdk_kind", native_enum=False, length=20),
        nullable=False,
    )
    base_url_default: Mapped[str] = mapped_column(String(300), nullable=False, server_default="")
    # Capabilities que o provider suporta (ex: ["chat","chat_vision","embed_text"]).
    capabilities: Mapped[list[str]] = mapped_column(
        ARRAY(String(30)), nullable=False, server_default=text("'{}'::varchar[]")
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"), index=True)


class AIModel(Base, TimestampedMixin):
    """Catálogo de modelos por provider, com preço vigente."""

    __tablename__ = "ai_models"
    __table_args__ = (
        UniqueConstraint("provider_id", "slug", name="uq_ai_models_provider_slug"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_providers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    capabilities: Mapped[list[str]] = mapped_column(
        ARRAY(String(30)), nullable=False, server_default=text("'{}'::varchar[]")
    )
    # Preços em centavos de US$ por 1 milhão de tokens — evita float.
    input_cost_per_mtok: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    output_cost_per_mtok: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    max_context: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"), index=True)


class AIPromptTemplate(Base, TimestampedMixin):
    """Template versionado. Operations referenciam (slug, version)."""

    __tablename__ = "ai_prompt_templates"
    __table_args__ = (
        UniqueConstraint("slug", "version", name="uq_ai_prompt_slug_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON schema esperado da resposta (quando operation precisa saída estruturada).
    response_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False, server_default="")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


# ─── Por-município ────────────────────────────────────────────────────────────


class AIMunicipalityKey(Base, TimestampedMixin):
    """API key de um provider, cifrada com Fernet.

    ``municipality_id`` NULL = chave global (fallback padrão pra todos os
    municípios). Não-NULL = personalização pra aquele município específico.
    Unicidade: 1 chave por provider no escopo global, 1 por (município, provider)
    no escopo municipal — garantida por índices parciais (migration 0021).
    """

    __tablename__ = "ai_municipality_keys"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    municipality_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_providers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Token ``fernet:v1:<base64>``. Nunca é retornado pro frontend.
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)
    # Sobrescreve base_url do provider (ex: Ollama numa LAN específica).
    base_url_override: Mapped[str] = mapped_column(String(300), nullable=False, server_default="")
    # Exibido na UI pra identificar a chave sem decifrar.
    key_fingerprint: Mapped[str] = mapped_column(String(16), nullable=False, server_default="")
    key_last4: Mapped[str] = mapped_column(String(4), nullable=False, server_default="")
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"), index=True)


class AICapabilityRoute(Base, TimestampedMixin):
    """Roteamento capability → model. Resolvido por escopo + priority ASC.

    Ordem de resolução ao responder uma capability:
    1. ``scope='module'`` com ``municipality_id`` e ``module_code`` casando.
    2. ``scope='municipality'`` com ``municipality_id`` casando.
    3. ``scope='global'`` (``municipality_id`` / ``module_code`` NULL).

    Dentro de um escopo, múltiplas linhas com priority crescente compõem
    a cadeia de failover.
    """

    __tablename__ = "ai_capability_routes"
    __table_args__ = (
        CheckConstraint(
            # global → sem município nem módulo
            "(scope = 'global' AND municipality_id IS NULL AND module_code IS NULL) OR "
            "(scope = 'municipality' AND municipality_id IS NOT NULL AND module_code IS NULL) OR "
            "(scope = 'module' AND municipality_id IS NOT NULL AND module_code IS NOT NULL)",
            name="scope_fields_match",
        ),
        Index(
            "ix_ai_routes_resolve",
            "scope",
            "municipality_id",
            "module_code",
            "capability",
            "priority",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    scope: Mapped[AIRouteScope] = mapped_column(
        # values_callable força gravar o value do enum (ex: "global") em vez
        # do name do membro Python ("global_" — com underscore porque `global`
        # é palavra reservada).
        Enum(
            AIRouteScope, name="ai_route_scope",
            native_enum=False, length=20,
            values_callable=lambda cls: [e.value for e in cls],
        ),
        nullable=False,
    )
    municipality_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        nullable=True,
    )
    module_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    capability: Mapped[str] = mapped_column(String(30), nullable=False)
    model_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_models.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class AIQuota(Base, TimestampedMixin):
    """Limites de consumo. ``municipality_id`` NULL = quota global padrão.

    ``period`` sempre ``month`` na F1. Unicidade via índice parcial
    (migration 0021): 1 quota global por período, 1 por (município, período).
    """

    __tablename__ = "ai_quotas"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    municipality_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    period: Mapped[str] = mapped_column(String(10), nullable=False, server_default="month")
    # 0 = sem limite.
    max_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("0"))
    max_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    max_requests: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    max_per_user_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("0"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class AIQuotaAlert(Base):
    """Estado de alertas já disparados pra não re-enviar no mesmo mês."""

    __tablename__ = "ai_quota_alerts"
    __table_args__ = (
        UniqueConstraint(
            "municipality_id", "year_month", "threshold",
            name="uq_ai_quota_alerts_mun_period_threshold",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    municipality_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    year_month: Mapped[str] = mapped_column(String(7), nullable=False)  # "YYYY-MM"
    threshold: Mapped[int] = mapped_column(Integer, nullable=False)     # 80, 100
    alerted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# ─── Consumo ──────────────────────────────────────────────────────────────────


class AIUsageLog(Base):
    """Log de cada chamada de IA. Particionada por RANGE (``at``) mensal.

    **LGPD**: não guarda payload (texto/imagem/resposta). Pra rastrear um
    caso específico, usa ``request_fingerprint`` (hash do input) e reproduz
    manualmente.
    """

    __tablename__ = "ai_usage_logs"
    __table_args__ = (
        # PK precisa incluir a chave de partição.
        Index(
            "ix_ai_usage_logs_mun_at", "municipality_id", "at",
            postgresql_ops={"at": "DESC"},
        ),
        Index("ix_ai_usage_logs_at", "at", postgresql_ops={"at": "DESC"}),
        Index("ix_ai_usage_logs_user_at", "user_id", "at", postgresql_ops={"at": "DESC"}),
        Index(
            "ix_ai_usage_logs_op_at", "operation_slug", "at",
            postgresql_ops={"at": "DESC"},
        ),
        UniqueConstraint(
            "municipality_id", "client_idempotency_key", "at",
            name="uq_ai_usage_logs_idempotency",
        ),
        {"postgresql_partition_by": "RANGE (at)"},
    )

    # PK composta (id, at) — at precisa estar na PK em tabelas particionadas.
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), primary_key=True,
    )

    municipality_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    module_code: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    operation_slug: Mapped[str] = mapped_column(String(80), nullable=False)
    capability: Mapped[str] = mapped_column(String(30), nullable=False)

    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    provider_slug: Mapped[str] = mapped_column(String(40), nullable=False, server_default="")
    model_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    model_slug: Mapped[str] = mapped_column(String(100), nullable=False, server_default="")

    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    # Preços vigentes congelados no log — relatório histórico não se altera
    # se catálogo mudar de preço depois.
    unit_cost_in_cents_snapshot: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    unit_cost_out_cents_snapshot: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    total_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    success: Mapped[bool] = mapped_column(Boolean, nullable=False, index=True)
    error_code: Mapped[str] = mapped_column(String(40), nullable=False, server_default="")
    error_message: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")

    prompt_template_slug: Mapped[str] = mapped_column(String(80), nullable=False, server_default="")
    prompt_template_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    client_idempotency_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
