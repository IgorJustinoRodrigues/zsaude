"""Tabela ``sectors`` + flag ``custom_sectors`` nas unidades.

Revision ID: 0055_sectors
Revises: 0054_devices
Create Date: 2026-04-21

Catálogo de **setores** (Cardiologia, Clínica Médica, etc) usado pra
encaminhamentos internos e pelos painéis pra filtrar o que exibir.

Hierarquia:
- Defaults do sistema são aplicados ao criar um município (via seed).
- Município pode editar/arquivar/criar novos.
- Unidade tem flag ``custom_sectors``:
  - ``false`` (default): herda o município.
  - ``true``: tem rows próprias em ``sectors`` (scope=facility). Ao
    virar ``true`` o serviço **clona** a lista do município pra facility.

Nomes são **snapshots** no momento da movimentação — renomear um setor
não quebra histórico.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0055_sectors"
down_revision: str | None = "0054_devices"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sectors",
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("scope_id", UUIDType(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("abbreviation", sa.String(20), nullable=False, server_default=" "),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sectors"),
        sa.CheckConstraint(
            "scope_type IN ('municipality', 'facility')",
            name="ck_sectors_scope_type",
        ),
        sa.UniqueConstraint(
            "scope_type", "scope_id", "name",
            name="uq_sectors_scope_name",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sectors_scope", "sectors",
        ["scope_type", "scope_id"],
        schema="app",
    )

    # Flag na facility. ``false`` = herda; ``true`` = tem setores próprios.
    op.add_column(
        "facilities",
        sa.Column(
            "custom_sectors", sa.Boolean(),
            nullable=False, server_default=sa.text("false"),
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("facilities", "custom_sectors", schema="app")
    op.drop_index("ix_sectors_scope", table_name="sectors", schema="app")
    op.drop_table("sectors", schema="app")
