"""Flags `archived` em municipalities e facilities

Revision ID: 0004_archived_flags
Revises: 0003_user_level
Create Date: 2026-04-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_archived_flags"
down_revision: str | None = "0003_user_level"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "municipalities",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema="app",
    )
    op.create_index("ix_municipalities_archived", "municipalities", ["archived"], schema="app")
    op.add_column(
        "facilities",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema="app",
    )
    op.create_index("ix_facilities_archived", "facilities", ["archived"], schema="app")


def downgrade() -> None:
    op.drop_index("ix_facilities_archived", table_name="facilities", schema="app")
    op.drop_column("facilities", "archived", schema="app")
    op.drop_index("ix_municipalities_archived", table_name="municipalities", schema="app")
    op.drop_column("municipalities", "archived", schema="app")
