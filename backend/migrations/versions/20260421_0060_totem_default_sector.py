"""Campo ``default_sector_name`` no totem.

Revision ID: 0060_totem_default_sector
Revises: 0059_totem_numbering
Create Date: 2026-04-21

Permite que um totem emita senhas direto pra um setor específico (pula
a fila da Recepção). Útil pra totens dedicados a serviços — farmácia,
laboratório, etc. NULL = comportamento padrão (senha vai pra recepção).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0060_totem_default_sector"
down_revision: str | None = "0059_totem_numbering"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "totens",
        sa.Column("default_sector_name", sa.String(120), nullable=True),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("totens", "default_sector_name", schema="app")
