"""Adiciona coluna level em app.users (MASTER/ADMIN/USER)

Revision ID: 0003_user_level
Revises: 0002_schema_app
Create Date: 2026-04-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_user_level"
down_revision: str | None = "0002_schema_app"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("level", sa.String(10), nullable=False, server_default="user"),
        schema="app",
    )
    op.create_index("ix_users_level", "users", ["level"], schema="app")
    # backfill: quem era superuser vira master
    op.execute("UPDATE app.users SET level = 'master' WHERE is_superuser = true")


def downgrade() -> None:
    op.drop_index("ix_users_level", table_name="users", schema="app")
    op.drop_column("users", "level", schema="app")
