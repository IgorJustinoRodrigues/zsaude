"""Adiciona ``users.cns`` (Cartão Nacional de Saúde) opcional.

Revision ID: 0048_user_cns
Revises: 0047_ai_catalog_2026
Create Date: 2026-04-20

Campo opcional usado para usuários USER/ADMIN (profissionais e
administradores municipais). MASTER não precisa.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0048_user_cns"
down_revision: str | None = "0047_ai_catalog_2026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("cns", sa.String(15), nullable=True),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("users", "cns", schema="app")
