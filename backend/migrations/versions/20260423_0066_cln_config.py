"""Configuração do módulo Clínico por município e unidade.

Revision ID: 0066_cln_config
Revises: 0065_tts_voice_speed
Create Date: 2026-04-23

Adiciona ``cln_config`` (JSONB) em ``municipalities`` e ``facilities``.

Semântica:
- ``NULL`` = "nunca configurado"; serviço resolve pros defaults (desabilitado,
  sem setores).
- Dict parcial: chaves ausentes herdam do pai (município pro caso da unidade,
  defaults pro caso do município).
- Campos esperados: ``enabled`` (bool), ``triagem_enabled`` (bool),
  ``triagem_sector_name`` (str | null), ``atendimento_sector_name`` (str).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType

revision: str = "0066_cln_config"
down_revision: str | None = "0065_tts_voice_speed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "municipalities",
        sa.Column("cln_config", JSONType(), nullable=True),
        schema="app",
    )
    op.add_column(
        "facilities",
        sa.Column("cln_config", JSONType(), nullable=True),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("facilities", "cln_config", schema="app")
    op.drop_column("municipalities", "cln_config", schema="app")
