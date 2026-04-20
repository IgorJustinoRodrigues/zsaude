"""Central de notificações persistente (``notifications``).

Revision ID: 0042_notifications
Revises: 0041_facility_enabled_modules
Create Date: 2026-04-20

Substitui o mock do frontend por uma tabela real. Cada linha é uma
notificação destinada a um ``user_id`` específico, com:

- ``type``: severity visual (info|success|warning|error)
- ``category``: tag lógica (``cnes_unbound``, ``password_expiring``, ...)
- ``title`` / ``message``: conteúdo exibido
- ``data``: payload JSON com contexto (facility_id, user_id alvo, etc.)
- ``dedup_key``: chave opcional pra idempotência. Se dois ``notify()``
  chamarem com o mesmo (user_id, dedup_key) e já existe uma não lida,
  não duplica — permite features como "você está sem vínculo CNES" sem
  spammar o inbox a cada login.
- ``read_at`` / ``dismissed_at``: estados do ciclo de vida.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType, UUIDType

revision: str = "0042_notifications"
down_revision: str | None = "0041_facility_enabled_modules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "user_id",
            UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(10), nullable=False, server_default="info"),
        sa.Column("category", sa.String(64), nullable=False, index=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("data", JSONType(), nullable=True),
        sa.Column("dedup_key", sa.String(200), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "type IN ('info','success','warning','error')",
            name="ck_notifications_type",
        ),
        schema="app",
    )
    # Query típica: "as não lidas do usuário X, ordenadas pelas mais recentes"
    op.create_index(
        "ix_app_notifications_user_created",
        "notifications",
        ["user_id", sa.text("created_at DESC")],
        schema="app",
    )
    # Dedup check: (user_id, dedup_key) + só conta o que ainda não foi lido
    # nem dismissed. Índice parcial agiliza — mas compat PG/Oracle: deixamos
    # como índice comum que filtra depois no SELECT.
    op.create_index(
        "ix_app_notifications_dedup",
        "notifications",
        ["user_id", "dedup_key"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_app_notifications_dedup", table_name="notifications", schema="app")
    op.drop_index("ix_app_notifications_user_created", table_name="notifications", schema="app")
    op.drop_table("notifications", schema="app")
