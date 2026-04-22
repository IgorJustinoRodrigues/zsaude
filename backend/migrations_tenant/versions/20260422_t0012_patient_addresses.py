"""Cria patient_addresses pra endereços secundários (trabalho, casa da mãe, etc.)

Revision ID: t0012_patient_addresses
Revises: t0011_identity_review
Create Date: 2026-04-22

Endereço principal continua em ``patients`` (cep, endereco, numero, etc.) —
esta tabela guarda só extras com um rótulo livre ("Trabalho", "Casa da
mãe"). Um paciente pode ter N endereços adicionais.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "t0012_patient_addresses"
down_revision: str | None = "t0011_identity_review"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PG_UUID = UUIDType()


def upgrade() -> None:
    op.create_table(
        "patient_addresses",
        sa.Column("id", PG_UUID, primary_key=True),
        sa.Column("patient_id", PG_UUID,
                  sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        # Descrição livre ("Trabalho", "Casa da mãe", "Sítio", etc.)
        sa.Column("label",         sa.String(60),  nullable=False),
        sa.Column("cep",           sa.String(8),   nullable=False, server_default=" "),
        sa.Column("endereco",      sa.String(200), nullable=False, server_default=" "),
        sa.Column("numero",        sa.String(20),  nullable=False, server_default=" "),
        sa.Column("complemento",   sa.String(100), nullable=False, server_default=" "),
        sa.Column("bairro",        sa.String(100), nullable=False, server_default=" "),
        sa.Column("municipio_ibge", sa.String(7),  nullable=False, server_default=" "),
        sa.Column("uf",            sa.String(2),   nullable=False, server_default=" "),
        sa.Column("pais",          sa.String(3),   nullable=False, server_default="BRA"),
        sa.Column("observacao",    sa.String(500), nullable=False, server_default=" "),
        sa.Column("display_order", sa.Integer(),   nullable=False, server_default="0"),
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_patient_addresses_patient_id", "patient_addresses", ["patient_id"])


def downgrade() -> None:
    op.drop_index("ix_patient_addresses_patient_id", table_name="patient_addresses")
    op.drop_table("patient_addresses")
