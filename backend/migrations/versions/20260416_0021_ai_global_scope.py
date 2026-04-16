"""IA: permite escopo global em ai_municipality_keys e ai_quotas

Revision ID: 0021_ai_global_scope
Revises: 0020_ai_catalog_seed
Create Date: 2026-04-16

Gestão passa a ser centralizada no SYS: o master configura chaves e quotas
globais (usadas por todos municípios por padrão) e só cria registros
municipais pra personalizar.

``municipality_id`` vira NULLABLE em ambas as tabelas. Unique constraints
antigas (que exigiam NOT NULL) viram índices parciais:

- ai_municipality_keys: UNIQUE (provider_id) WHERE municipality_id IS NULL
                        UNIQUE (municipality_id, provider_id) WHERE IS NOT NULL
- ai_quotas:            UNIQUE (period)       WHERE municipality_id IS NULL
                        UNIQUE (municipality_id, period) WHERE IS NOT NULL
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0021_ai_global_scope"
down_revision: str | None = "0020_ai_catalog_seed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── ai_municipality_keys ─────────────────────────────────────────
    op.execute(
        "ALTER TABLE app.ai_municipality_keys "
        "ALTER COLUMN municipality_id DROP NOT NULL;"
    )
    op.drop_constraint(
        "uq_ai_mun_key_mun_provider",
        "ai_municipality_keys",
        schema="app",
        type_="unique",
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_ai_keys_global "
        "ON app.ai_municipality_keys (provider_id) "
        "WHERE municipality_id IS NULL;"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_ai_keys_municipal "
        "ON app.ai_municipality_keys (municipality_id, provider_id) "
        "WHERE municipality_id IS NOT NULL;"
    )

    # ── ai_quotas ────────────────────────────────────────────────────
    op.execute(
        "ALTER TABLE app.ai_quotas "
        "ALTER COLUMN municipality_id DROP NOT NULL;"
    )
    op.drop_constraint(
        "uq_ai_quota_mun_period",
        "ai_quotas",
        schema="app",
        type_="unique",
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_ai_quota_global "
        "ON app.ai_quotas (period) "
        "WHERE municipality_id IS NULL;"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_ai_quota_municipal "
        "ON app.ai_quotas (municipality_id, period) "
        "WHERE municipality_id IS NOT NULL;"
    )


def downgrade() -> None:
    # Restaura constraints NOT NULL. Se houver linhas com municipality_id=NULL
    # a migration falha — é intencional (chame a limpeza antes).
    op.execute("DROP INDEX IF EXISTS app.uq_ai_quota_municipal;")
    op.execute("DROP INDEX IF EXISTS app.uq_ai_quota_global;")
    op.create_unique_constraint(
        "uq_ai_quota_mun_period",
        "ai_quotas",
        ["municipality_id", "period"],
        schema="app",
    )
    op.execute(
        "ALTER TABLE app.ai_quotas "
        "ALTER COLUMN municipality_id SET NOT NULL;"
    )

    op.execute("DROP INDEX IF EXISTS app.uq_ai_keys_municipal;")
    op.execute("DROP INDEX IF EXISTS app.uq_ai_keys_global;")
    op.create_unique_constraint(
        "uq_ai_mun_key_mun_provider",
        "ai_municipality_keys",
        ["municipality_id", "provider_id"],
        schema="app",
    )
    op.execute(
        "ALTER TABLE app.ai_municipality_keys "
        "ALTER COLUMN municipality_id SET NOT NULL;"
    )
