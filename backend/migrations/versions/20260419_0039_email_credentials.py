"""Credenciais de envio de e-mail por escopo (``email_credentials``).

Revision ID: 0039_email_credentials
Revises: 0038_email_send_log
Create Date: 2026-04-19

Guarda a configuração de remetente (SES) por escopo, com cascata idêntica
à dos templates:

    FACILITY → MUNICIPALITY → SYSTEM (banco) → settings/env (fallback)

Cada linha é uma ``IAM key + from_email + região + configuration set``.
A secret do access key é cifrada via Fernet (mesmo mecanismo da senha
CadSUS). A key id é gravada em claro pra facilitar debug.

Uso: MASTER edita SYSTEM (o padrão global). ADMIN do município edita a
linha MUNICIPALITY dele. Uma unidade com volume grande/regra própria
pode ter a sua em FACILITY.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0039_email_credentials"
down_revision: str | None = "0038_email_send_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_credentials",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("scope_id", UUIDType(), nullable=False),
        sa.Column("from_email", sa.String(200), nullable=False),
        sa.Column("from_name", sa.String(200), nullable=False, server_default=" "),
        sa.Column("aws_region", sa.String(32), nullable=False, server_default="us-east-1"),
        sa.Column("aws_access_key_id", sa.String(200), nullable=False),
        # Secret key cifrada via Fernet. Base64 da Fernet cresce ~33%;
        # 500 chars segura com folga qualquer key AWS (~40 chars plain).
        sa.Column("aws_secret_access_key_enc", sa.String(500), nullable=False),
        sa.Column("ses_configuration_set", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
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
        sa.UniqueConstraint(
            "scope_type", "scope_id", name="uq_email_credentials_scope",
        ),
        sa.CheckConstraint(
            "scope_type IN ('system', 'municipality', 'facility')",
            name="ck_email_credentials_scope_type",
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_table("email_credentials", schema="app")
