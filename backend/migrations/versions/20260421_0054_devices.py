"""Tabela ``devices`` — pareamento de totens e painéis.

Revision ID: 0054_devices
Revises: 0053_rec_config
Create Date: 2026-04-21

Ciclo de vida de um device:
- **Pending**: ``pairing_code`` preenchido + ``pairing_expires_at`` no futuro;
  ``token_hash`` NULL. Aguardando um usuário autenticado consumir o código.
- **Paired**: ``pairing_code`` NULL, ``token_hash`` preenchido, ``paired_at``
  e ``facility_id`` setados. Dispositivo operando.
- **Revoked**: ``revoked_at`` preenchido, ``token_hash`` NULL (não aceita mais
  requisições). Linha é mantida pra histórico/audit.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0054_devices"
down_revision: str | None = "0053_rec_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column(
            "facility_id", UUIDType(),
            sa.ForeignKey("app.facilities.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(120), nullable=True),

        # Pareamento (cleared ao parear)
        sa.Column("pairing_code", sa.String(10), nullable=True),
        sa.Column("pairing_expires_at", sa.DateTime(timezone=True), nullable=True),

        # Pareado
        sa.Column("paired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "paired_by_user_id", UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="SET NULL"),
            nullable=True,
        ),

        # Token de acesso do device (hash)
        sa.Column("token_hash", sa.String(64), nullable=True),

        # Presença — atualizado pelo WS ou pings
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),

        # Revogação
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "revoked_by_user_id", UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),

        sa.PrimaryKeyConstraint("id", name="pk_devices"),
        sa.CheckConstraint(
            "type IN ('totem', 'painel')",
            name="ck_devices_type_valid",
        ),
        schema="app",
    )

    # Índices
    op.create_index(
        "ix_devices_facility_id", "devices", ["facility_id"], schema="app",
    )
    # Código único enquanto pendente — partial index (PostgreSQL).
    op.create_index(
        "uq_devices_pairing_code",
        "devices", ["pairing_code"],
        schema="app",
        unique=True,
        postgresql_where=sa.text("pairing_code IS NOT NULL"),
    )
    # Token único (hash) enquanto ativo.
    op.create_index(
        "uq_devices_token_hash",
        "devices", ["token_hash"],
        schema="app",
        unique=True,
        postgresql_where=sa.text("token_hash IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_devices_token_hash", table_name="devices", schema="app")
    op.drop_index("uq_devices_pairing_code", table_name="devices", schema="app")
    op.drop_index("ix_devices_facility_id", table_name="devices", schema="app")
    op.drop_table("devices", schema="app")
