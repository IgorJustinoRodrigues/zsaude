"""Política de senhas: expiração e histórico.

Revision ID: 0032_password_policy
Revises: 0031_user_cpf_email_nullable
Create Date: 2026-04-18

Adiciona:

- ``users.password_changed_at`` — timestamp da última troca. Usado pra
  calcular expiração (default 90 dias via ``system_settings``).
- ``password_history`` — últimas N senhas (hashes) por usuário.
  Impede reutilização (default bloqueia as 5 mais recentes).

Usuários já existentes recebem ``password_changed_at = CURRENT_TIMESTAMP``
no upgrade — começam a contar do zero.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0032_password_policy"
down_revision: str | None = "0031_user_cpf_email_nullable"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "password_changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        schema="app",
    )

    op.create_table(
        "password_history",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "user_id",
            UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        schema="app",
    )
    op.create_index(
        "ix_app_password_history_user_id",
        "password_history",
        ["user_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_app_password_history_user_id",
        table_name="password_history",
        schema="app",
    )
    op.drop_table("password_history", schema="app")
    op.drop_column("users", "password_changed_at", schema="app")
