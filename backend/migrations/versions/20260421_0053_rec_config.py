"""Configuração do módulo Recepção por município e unidade.

Revision ID: 0053_rec_config
Revises: 0052_rename_cha_to_rec
Create Date: 2026-04-21

Adiciona ``rec_config`` (JSONB) em ``municipalities`` e ``facilities``.

Semântica:
- ``NULL`` = "nunca configurado". No serviço, resolve pros defaults do sistema
  (totem/painel/recepção habilitados, capturas básicas).
- Dict parcial: chaves ausentes herdam do pai (município pro caso da unidade,
  defaults pro caso do município).
- Facility só "aumenta restrição" — se o município desabilita totem, unidade
  não pode habilitar (enforçado no service, igual ao padrão de
  ``enabled_modules``).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType

revision: str = "0053_rec_config"
down_revision: str | None = "0052_rename_cha_to_rec"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "municipalities",
        sa.Column("rec_config", JSONType(), nullable=True),
        schema="app",
    )
    op.add_column(
        "facilities",
        sa.Column("rec_config", JSONType(), nullable=True),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("facilities", "rec_config", schema="app")
    op.drop_column("municipalities", "rec_config", schema="app")
