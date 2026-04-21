"""Verificação de e-mail: campos no User + tabela ``email_verifications``.

Revision ID: 0036_email_verification
Revises: 0035_email_templates
Create Date: 2026-04-19

Adiciona:

- ``users.email_verified_at`` — carimbo de quando o usuário confirmou o
  e-mail. NULL = não verificado. Ser NULL **não bloqueia login por CPF**.
- ``users.pending_email`` — quando o usuário troca o e-mail, o novo fica
  aqui até ser confirmado (o ``email`` continua sendo o atual). Depois
  da confirmação, promovemos ``pending_email`` → ``email``.
- Tabela ``email_verifications`` — tokens opacos (SHA-256 hash), uso
  único, espelho de ``password_resets``.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0036_email_verification"
down_revision: str | None = "0035_email_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        schema="app",
    )
    op.add_column(
        "users",
        sa.Column("pending_email", sa.String(200), nullable=True),
        schema="app",
    )

    op.create_table(
        "email_verifications",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "user_id",
            UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email_target", sa.String(200), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.String(64), nullable=False, server_default=" "),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_table("email_verifications", schema="app")
    op.drop_column("users", "pending_email", schema="app")
    op.drop_column("users", "email_verified_at", schema="app")
