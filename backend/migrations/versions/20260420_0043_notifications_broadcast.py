"""Notificações ricas + broadcast com logs de leitura.

Revision ID: 0043_notifications_broadcast
Revises: 0042_notifications
Create Date: 2026-04-20

Expande ``notifications`` com:

- ``body`` TEXT  — conteúdo extenso, opcional. Mostrado no modal de detalhe.
- ``action_url`` / ``action_label`` — CTA clicável (ex.: "Trocar senha" →
  ``/minha-conta``). Quando presente, detail view exibe botão.
- ``created_by_user_id`` — quem gerou (NULL = sistema). Pra identificar
  broadcasts manuais vs automáticos.
- ``broadcast_id`` — aponta pra ``notification_broadcasts``. Mesmo
  broadcast gera N notifications (uma por user no escopo); ``broadcast_id``
  permite agregar pra stats de leitura.

E cria ``notification_broadcasts`` — metadata de envios em massa feitos
via admin UI. Cada linha representa um clique em "Nova notificação" do
MASTER/ADMIN. Escopo pode ser all/municipality/facility/user.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType, UUIDType

revision: str = "0043_notifications_broadcast"
down_revision: str | None = "0042_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notification_broadcasts",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "created_by_user_id",
            UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("scope_type", sa.String(20), nullable=False),  # all|municipality|facility|user
        sa.Column("scope_id", UUIDType(), nullable=True),
        sa.Column("scope_label", sa.String(200), nullable=False, server_default=" "),
        sa.Column("type", sa.String(10), nullable=False, server_default="info"),
        sa.Column("category", sa.String(64), nullable=False, server_default="manual"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("action_url", sa.String(500), nullable=True),
        sa.Column("action_label", sa.String(100), nullable=True),
        sa.Column("data", JSONType(), nullable=True),
        sa.Column("total_recipients", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "scope_type IN ('all','municipality','facility','user')",
            name="ck_notification_broadcasts_scope",
        ),
        sa.CheckConstraint(
            "type IN ('info','success','warning','error')",
            name="ck_notification_broadcasts_type",
        ),
        schema="app",
    )

    op.add_column(
        "notifications",
        sa.Column("body", sa.Text(), nullable=True),
        schema="app",
    )
    op.add_column(
        "notifications",
        sa.Column("action_url", sa.String(500), nullable=True),
        schema="app",
    )
    op.add_column(
        "notifications",
        sa.Column("action_label", sa.String(100), nullable=True),
        schema="app",
    )
    op.add_column(
        "notifications",
        sa.Column(
            "created_by_user_id",
            UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="app",
    )
    op.add_column(
        "notifications",
        sa.Column(
            "broadcast_id",
            UUIDType(),
            sa.ForeignKey(
                "app.notification_broadcasts.id", ondelete="SET NULL",
            ),
            nullable=True,
        ),
        schema="app",
    )
    op.create_index(
        "ix_app_notifications_broadcast",
        "notifications",
        ["broadcast_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_app_notifications_broadcast", table_name="notifications", schema="app")
    op.drop_column("notifications", "broadcast_id", schema="app")
    op.drop_column("notifications", "created_by_user_id", schema="app")
    op.drop_column("notifications", "action_label", schema="app")
    op.drop_column("notifications", "action_url", schema="app")
    op.drop_column("notifications", "body", schema="app")
    op.drop_table("notification_broadcasts", schema="app")
