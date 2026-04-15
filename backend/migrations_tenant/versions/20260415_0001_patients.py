"""Cria tabela patients no schema do município

Revision ID: t0001_patients
Revises:
Create Date: 2026-04-15

Esta migration vive em CADA schema `mun_<ibge>`, não no `app`. Criada pelo
runner do módulo `scripts/migrate_tenants.py` ou pelo provisionamento
automático em `POST /admin/municipalities`.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "t0001_patients"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NOTE: sem `schema=`; o search_path já está no schema do município.
    op.create_table(
        "patients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("prontuario", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("cpf", sa.String(11), nullable=False),
        sa.Column("cns", sa.String(15), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("sex", sa.String(1), nullable=True),
        sa.Column("phone", sa.String(20), nullable=False, server_default=""),
        sa.Column("email", sa.String(200), nullable=False, server_default=""),
        sa.Column("mother_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("father_name", sa.String(200), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("prontuario", name="uq_patients_prontuario"),
        sa.UniqueConstraint("cpf", name="uq_patients_cpf"),
    )
    op.create_index("ix_patients_name", "patients", ["name"])
    op.create_index("ix_patients_cpf", "patients", ["cpf"])
    op.create_index("ix_patients_cns", "patients", ["cns"])
    op.create_index("ix_patients_active", "patients", ["active"])


def downgrade() -> None:
    op.drop_index("ix_patients_active", table_name="patients")
    op.drop_index("ix_patients_cns", table_name="patients")
    op.drop_index("ix_patients_cpf", table_name="patients")
    op.drop_index("ix_patients_name", table_name="patients")
    op.drop_table("patients")
