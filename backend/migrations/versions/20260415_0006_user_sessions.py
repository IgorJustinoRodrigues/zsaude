"""Cria app.user_sessions

Revision ID: 0006_user_sessions
Revises: 0005_system_settings
Create Date: 2026-04-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_user_sessions"
down_revision: str | None = "0005_system_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(30), nullable=True),
        sa.Column("ip", sa.String(64), nullable=False, server_default=""),
        sa.Column("user_agent", sa.String(500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["app.users.id"], ondelete="CASCADE",
                                name="fk_user_sessions_user_id_users"),
        sa.UniqueConstraint("family_id", name="uq_user_sessions_family_id"),
        schema="app",
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"], schema="app")
    op.create_index("ix_user_sessions_family_id", "user_sessions", ["family_id"], schema="app")
    op.create_index(
        "ix_user_sessions_user_started", "user_sessions",
        ["user_id", sa.text("started_at DESC")], schema="app",
    )
    op.create_index(
        "ix_user_sessions_active", "user_sessions",
        ["user_id", "ended_at"], schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_user_sessions_active", table_name="user_sessions", schema="app")
    op.drop_index("ix_user_sessions_user_started", table_name="user_sessions", schema="app")
    op.drop_index("ix_user_sessions_family_id", table_name="user_sessions", schema="app")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions", schema="app")
    op.drop_table("user_sessions", schema="app")
