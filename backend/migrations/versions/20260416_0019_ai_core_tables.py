"""Gateway de IA — tabelas de catálogo, config por município e logs

Revision ID: 0019_ai_core_tables
Revises: 0018_cadsus_password_fernet
Create Date: 2026-04-16

Cria o núcleo do gateway de IA:
- Catálogo global: ai_providers, ai_models, ai_prompt_templates
- Por-município: ai_municipality_keys, ai_capability_routes, ai_quotas, ai_quota_alerts
- Log de consumo: ai_usage_logs (particionada RANGE por ``at`` mensal)

A ai_usage_logs é particionada pra permitir purge por RANGE (DROP PARTITION)
em vez de DELETE + VACUUM, e pra manter queries do dashboard rápidas mesmo
com milhões de linhas. Cria partições dos últimos 2 meses + 6 meses à frente.

Esta migration NÃO faz seed — é só estrutura. O seed de providers/models
base vem na 0020.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_ai_core_tables"
down_revision: str | None = "0018_cadsus_password_fernet"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _month_range(d: date) -> tuple[str, str]:
    """(YYYYMM, YYYY-MM-01, YYYY-MM-01_next) pra criar partição do mês de d."""
    y, m = d.year, d.month
    start = f"{y:04d}-{m:02d}-01"
    if m == 12:
        ny, nm = y + 1, 1
    else:
        ny, nm = y, m + 1
    end = f"{ny:04d}-{nm:02d}-01"
    return f"{y:04d}{m:02d}", start, end  # type: ignore[return-value]


def _iter_months(start: date, count: int):
    """Itera count meses começando em start (1º do mês)."""
    d = start.replace(day=1)
    for _ in range(count):
        yield d
        if d.month == 12:
            d = d.replace(year=d.year + 1, month=1)
        else:
            d = d.replace(month=d.month + 1)


# ─── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    # ── ai_providers ────────────────────────────────────────────────────
    op.create_table(
        "ai_providers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(40), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("sdk_kind", sa.String(20), nullable=False),
        sa.Column("base_url_default", sa.String(300), nullable=False, server_default=""),
        sa.Column(
            "capabilities",
            postgresql.ARRAY(sa.String(30)),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_ai_providers_slug"),
        schema="app",
    )
    op.create_index("ix_ai_providers_slug", "ai_providers", ["slug"], schema="app")
    op.create_index("ix_ai_providers_active", "ai_providers", ["active"], schema="app")

    # ── ai_models ───────────────────────────────────────────────────────
    op.create_table(
        "ai_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column(
            "capabilities",
            postgresql.ARRAY(sa.String(30)),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
        sa.Column("input_cost_per_mtok", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("output_cost_per_mtok", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_context", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["app.ai_providers.id"],
            ondelete="RESTRICT", name="fk_ai_models_provider_id_ai_providers",
        ),
        sa.UniqueConstraint("provider_id", "slug", name="uq_ai_models_provider_slug"),
        schema="app",
    )
    op.create_index("ix_ai_models_provider_id", "ai_models", ["provider_id"], schema="app")
    op.create_index("ix_ai_models_active", "ai_models", ["active"], schema="app")

    # ── ai_prompt_templates ────────────────────────────────────────────
    op.create_table(
        "ai_prompt_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("response_schema", postgresql.JSONB(), nullable=True),
        sa.Column("description", sa.String(300), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("slug", "version", name="uq_ai_prompt_slug_version"),
        schema="app",
    )
    op.create_index("ix_ai_prompt_templates_slug", "ai_prompt_templates", ["slug"], schema="app")

    # ── ai_municipality_keys ───────────────────────────────────────────
    op.create_table(
        "ai_municipality_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("municipality_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
        sa.Column("base_url_override", sa.String(300), nullable=False, server_default=""),
        sa.Column("key_fingerprint", sa.String(16), nullable=False, server_default=""),
        sa.Column("key_last4", sa.String(4), nullable=False, server_default=""),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["municipality_id"], ["app.municipalities.id"],
            ondelete="CASCADE", name="fk_ai_municipality_keys_municipality_id_municipalities",
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["app.ai_providers.id"],
            ondelete="RESTRICT", name="fk_ai_municipality_keys_provider_id_ai_providers",
        ),
        sa.UniqueConstraint("municipality_id", "provider_id", name="uq_ai_mun_key_mun_provider"),
        schema="app",
    )
    op.create_index(
        "ix_ai_municipality_keys_municipality_id",
        "ai_municipality_keys", ["municipality_id"], schema="app",
    )
    op.create_index(
        "ix_ai_municipality_keys_provider_id",
        "ai_municipality_keys", ["provider_id"], schema="app",
    )
    op.create_index(
        "ix_ai_municipality_keys_active",
        "ai_municipality_keys", ["active"], schema="app",
    )

    # ── ai_capability_routes ───────────────────────────────────────────
    op.create_table(
        "ai_capability_routes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("municipality_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("module_code", sa.String(20), nullable=True),
        sa.Column("capability", sa.String(30), nullable=False),
        sa.Column("model_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["municipality_id"], ["app.municipalities.id"],
            ondelete="CASCADE", name="fk_ai_capability_routes_municipality_id_municipalities",
        ),
        sa.ForeignKeyConstraint(
            ["model_id"], ["app.ai_models.id"],
            ondelete="RESTRICT", name="fk_ai_capability_routes_model_id_ai_models",
        ),
        sa.CheckConstraint(
            "(scope = 'global' AND municipality_id IS NULL AND module_code IS NULL) OR "
            "(scope = 'municipality' AND municipality_id IS NOT NULL AND module_code IS NULL) OR "
            "(scope = 'module' AND municipality_id IS NOT NULL AND module_code IS NOT NULL)",
            name="ck_ai_capability_routes_scope_fields_match",
        ),
        schema="app",
    )
    op.create_index(
        "ix_ai_routes_resolve", "ai_capability_routes",
        ["scope", "municipality_id", "module_code", "capability", "priority"],
        schema="app",
    )
    op.create_index(
        "ix_ai_capability_routes_model_id",
        "ai_capability_routes", ["model_id"], schema="app",
    )

    # ── ai_quotas ──────────────────────────────────────────────────────
    op.create_table(
        "ai_quotas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("municipality_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period", sa.String(10), nullable=False, server_default="month"),
        sa.Column("max_tokens", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_cost_cents", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_requests", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_per_user_tokens", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["municipality_id"], ["app.municipalities.id"],
            ondelete="CASCADE", name="fk_ai_quotas_municipality_id_municipalities",
        ),
        sa.UniqueConstraint("municipality_id", "period", name="uq_ai_quota_mun_period"),
        schema="app",
    )
    op.create_index(
        "ix_ai_quotas_municipality_id",
        "ai_quotas", ["municipality_id"], schema="app",
    )

    # ── ai_quota_alerts ────────────────────────────────────────────────
    op.create_table(
        "ai_quota_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("municipality_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("year_month", sa.String(7), nullable=False),
        sa.Column("threshold", sa.Integer(), nullable=False),
        sa.Column("alerted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["municipality_id"], ["app.municipalities.id"],
            ondelete="CASCADE", name="fk_ai_quota_alerts_municipality_id_municipalities",
        ),
        sa.UniqueConstraint(
            "municipality_id", "year_month", "threshold",
            name="uq_ai_quota_alerts_mun_period_threshold",
        ),
        schema="app",
    )
    op.create_index(
        "ix_ai_quota_alerts_municipality_id",
        "ai_quota_alerts", ["municipality_id"], schema="app",
    )

    # ── ai_usage_logs (particionada RANGE por `at`) ────────────────────
    # Alembic não suporta criar tabelas particionadas via op.create_table
    # de forma portável — saímos em SQL cru.
    op.execute(
        """
        CREATE TABLE app.ai_usage_logs (
            id                              UUID NOT NULL,
            at                              TIMESTAMPTZ NOT NULL DEFAULT now(),
            municipality_id                 UUID,
            user_id                         UUID,
            module_code                     VARCHAR(20) NOT NULL DEFAULT '',
            operation_slug                  VARCHAR(80) NOT NULL,
            capability                      VARCHAR(30) NOT NULL,
            provider_id                     UUID,
            provider_slug                   VARCHAR(40) NOT NULL DEFAULT '',
            model_id                        UUID,
            model_slug                      VARCHAR(100) NOT NULL DEFAULT '',
            tokens_in                       INTEGER NOT NULL DEFAULT 0,
            tokens_out                      INTEGER NOT NULL DEFAULT 0,
            unit_cost_in_cents_snapshot     INTEGER NOT NULL DEFAULT 0,
            unit_cost_out_cents_snapshot    INTEGER NOT NULL DEFAULT 0,
            total_cost_cents                INTEGER NOT NULL DEFAULT 0,
            latency_ms                      INTEGER NOT NULL DEFAULT 0,
            success                         BOOLEAN NOT NULL,
            error_code                      VARCHAR(40) NOT NULL DEFAULT '',
            error_message                   VARCHAR(500) NOT NULL DEFAULT '',
            prompt_template_slug            VARCHAR(80) NOT NULL DEFAULT '',
            prompt_template_version         INTEGER,
            client_idempotency_key          VARCHAR(80),
            request_fingerprint             VARCHAR(64) NOT NULL DEFAULT '',
            CONSTRAINT pk_ai_usage_logs PRIMARY KEY (id, at)
        ) PARTITION BY RANGE (at);
        """
    )
    op.execute(
        "CREATE INDEX ix_ai_usage_logs_mun_at ON app.ai_usage_logs (municipality_id, at DESC);"
    )
    op.execute(
        "CREATE INDEX ix_ai_usage_logs_at ON app.ai_usage_logs (at DESC);"
    )
    op.execute(
        "CREATE INDEX ix_ai_usage_logs_user_at ON app.ai_usage_logs (user_id, at DESC);"
    )
    op.execute(
        "CREATE INDEX ix_ai_usage_logs_op_at ON app.ai_usage_logs (operation_slug, at DESC);"
    )
    op.execute(
        "CREATE INDEX ix_ai_usage_logs_success ON app.ai_usage_logs (success);"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_ai_usage_logs_idempotency "
        "ON app.ai_usage_logs (municipality_id, client_idempotency_key, at) "
        "WHERE client_idempotency_key IS NOT NULL;"
    )

    # Cria partições: 2 meses atrás, mês atual, 6 meses à frente.
    today = datetime.now(UTC).date().replace(day=1)
    # começa 2 meses atrás
    y, m = today.year, today.month
    m -= 2
    while m <= 0:
        m += 12
        y -= 1
    start = date(y, m, 1)
    for d in _iter_months(start, 9):
        tag, a, b = _month_range(d)
        op.execute(
            f"""
            CREATE TABLE app.ai_usage_logs_{tag} PARTITION OF app.ai_usage_logs
            FOR VALUES FROM ('{a}') TO ('{b}');
            """
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app.ai_usage_logs CASCADE;")
    op.drop_index("ix_ai_quota_alerts_municipality_id", table_name="ai_quota_alerts", schema="app")
    op.drop_table("ai_quota_alerts", schema="app")
    op.drop_index("ix_ai_quotas_municipality_id", table_name="ai_quotas", schema="app")
    op.drop_table("ai_quotas", schema="app")
    op.drop_index("ix_ai_capability_routes_model_id", table_name="ai_capability_routes", schema="app")
    op.drop_index("ix_ai_routes_resolve", table_name="ai_capability_routes", schema="app")
    op.drop_table("ai_capability_routes", schema="app")
    op.drop_index("ix_ai_municipality_keys_active", table_name="ai_municipality_keys", schema="app")
    op.drop_index("ix_ai_municipality_keys_provider_id", table_name="ai_municipality_keys", schema="app")
    op.drop_index("ix_ai_municipality_keys_municipality_id", table_name="ai_municipality_keys", schema="app")
    op.drop_table("ai_municipality_keys", schema="app")
    op.drop_index("ix_ai_prompt_templates_slug", table_name="ai_prompt_templates", schema="app")
    op.drop_table("ai_prompt_templates", schema="app")
    op.drop_index("ix_ai_models_active", table_name="ai_models", schema="app")
    op.drop_index("ix_ai_models_provider_id", table_name="ai_models", schema="app")
    op.drop_table("ai_models", schema="app")
    op.drop_index("ix_ai_providers_active", table_name="ai_providers", schema="app")
    op.drop_index("ix_ai_providers_slug", table_name="ai_providers", schema="app")
    op.drop_table("ai_providers", schema="app")
