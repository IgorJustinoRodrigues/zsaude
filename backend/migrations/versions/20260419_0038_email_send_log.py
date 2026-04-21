"""Log de envios de e-mail (``email_send_log``).

Revision ID: 0038_email_send_log
Revises: 0037_municipality_timezone
Create Date: 2026-04-19

Registra cada e-mail efetivamente enviado (ou tentado). Serve para:

- **Auditoria** — quando um usuário reclama "não recebi".
- **Troubleshooting** — ver payload de erro quando o SES retorna bounce.
- **Idempotência** — via ``idempotency_key`` garantimos que o mesmo
  disparo (ex.: parabéns do ano) não sai duas vezes.
- **Métricas** — volume de envios por template / município.

Campos:

- ``user_id`` nullable (forgot-password é anônimo — não sabemos o user até
  validar, mas ainda logamos o destinatário).
- ``idempotency_key`` UNIQUE quando NOT NULL. Schema: livre pro chamador
  (ex.: ``birthday_birth:<user_id>:<year>``, ``verify:<token>``).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0038_email_send_log"
down_revision: str | None = "0037_municipality_timezone"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_send_log",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "user_id",
            UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "municipality_id",
            UUIDType(),
            sa.ForeignKey("app.municipalities.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("template_code", sa.String(64), nullable=False, index=True),
        sa.Column("to_address", sa.String(200), nullable=False, index=True),
        sa.Column("from_address", sa.String(200), nullable=False, server_default=" "),
        sa.Column("subject", sa.String(255), nullable=False, server_default=" "),
        sa.Column("message_id", sa.String(255), nullable=False, server_default=" "),
        sa.Column("status", sa.String(20), nullable=False, server_default="sent"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(200), nullable=True, unique=True),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "status IN ('sent', 'failed', 'skipped')",
            name="ck_email_send_log_status",
        ),
        schema="app",
    )
    op.create_index(
        "ix_app_email_send_log_code_sent_at",
        "email_send_log",
        ["template_code", "sent_at"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_app_email_send_log_code_sent_at",
        table_name="email_send_log", schema="app",
    )
    op.drop_table("email_send_log", schema="app")
