"""Vínculo ``devices → painels/totens``.

Revision ID: 0058_device_links
Revises: 0057_totens
Create Date: 2026-04-21

Adiciona ``painel_id`` e ``totem_id`` em ``devices`` — FKs opcionais
apontando pra config lógica que o dispositivo físico executa.

- Device ``type='painel'`` deve apontar pra ``painel_id`` (ou NULL =
  aguardando configuração).
- Device ``type='totem'`` deve apontar pra ``totem_id``.
- Apenas um dos dois pode estar setado por vez (check constraint).
- ``ON DELETE SET NULL``: se o painel/totem é deletado, o device volta
  pro estado "aguardando configuração" sem perder o pareamento.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0058_device_links"
down_revision: str | None = "0057_totens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "devices",
        sa.Column(
            "painel_id", UUIDType(),
            sa.ForeignKey("app.painels.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="app",
    )
    op.add_column(
        "devices",
        sa.Column(
            "totem_id", UUIDType(),
            sa.ForeignKey("app.totens.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="app",
    )
    # Só um dos dois pode estar setado — ou nenhum (aguardando config).
    op.create_check_constraint(
        "ck_devices_link_xor",
        "devices",
        "NOT (painel_id IS NOT NULL AND totem_id IS NOT NULL)",
        schema="app",
    )


def downgrade() -> None:
    op.drop_constraint("ck_devices_link_xor", "devices", schema="app", type_="check")
    op.drop_column("devices", "totem_id", schema="app")
    op.drop_column("devices", "painel_id", schema="app")
