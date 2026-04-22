"""Remove ``sectors.available_in_reception``.

Revision ID: 0062_drop_sector_rec_flag
Revises: 0061_sector_reception_flag
Create Date: 2026-04-22

Substituído pela config ``rec_config.recepcao.forward_sector_names``
(lista por escopo, cascateável, combina com o padrão dos módulos).
A flag por setor não escalava pra outros módulos sem virar M colunas.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0062_drop_sector_rec_flag"
down_revision: str | None = "0061_sector_reception_flag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("sectors", "available_in_reception", schema="app")


def downgrade() -> None:
    op.add_column(
        "sectors",
        sa.Column(
            "available_in_reception",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        schema="app",
    )
