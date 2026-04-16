"""Módulos habilitados por município

Revision ID: 0010_mun_enabled_modules
Revises: 0009_mun_geo_neighborhoods
Create Date: 2026-04-15

Adiciona em ``app.municipalities`` a coluna ``enabled_modules`` (JSONB):
lista de códigos de módulos operacionais (``cln``, ``dgn``, ...) que o
município habilitou. Default para linhas existentes e novas: todos os
módulos operacionais — a restrição ganha sentido quando o MASTER desabilita
módulos específicos.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_mun_enabled_modules"
down_revision: str | None = "0009_mun_geo_neighborhoods"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_DEFAULT_MODULES = ["cln", "dgn", "hsp", "pln", "fsc", "ops", "ind", "cha", "esu"]


def upgrade() -> None:
    op.add_column(
        "municipalities",
        sa.Column("enabled_modules", postgresql.JSONB(), nullable=True),
        schema="app",
    )
    # Preenche linhas existentes com o conjunto completo.
    op.execute(
        "UPDATE app.municipalities SET enabled_modules = "
        "'[\"cln\",\"dgn\",\"hsp\",\"pln\",\"fsc\",\"ops\",\"ind\",\"cha\",\"esu\"]'::jsonb "
        "WHERE enabled_modules IS NULL"
    )


def downgrade() -> None:
    op.drop_column("municipalities", "enabled_modules", schema="app")


# Exporta pra docs/seed se precisar.
__all__ = ["revision", "down_revision", "_DEFAULT_MODULES"]
