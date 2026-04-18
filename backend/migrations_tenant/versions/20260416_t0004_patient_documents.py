"""Cria patient_documents e remove colunas legacy de patients

Revision ID: t0004_patient_documents
Revises: t0003_patients_expand
Create Date: 2026-04-16

A partir desta revisão, todos os documentos do paciente (RG, CNH, Passaporte,
NIS, Título de eleitor, CadÚnico, etc.) vivem em ``patient_documents`` —
lista dinâmica. CPF e CNS continuam em ``patients`` por serem chaves de
busca/identidade.

Colunas removidas de ``patients``:
- rg, rg_orgao_emissor, rg_uf, rg_data_emissao
- tipo_documento_id, numero_documento
- passaporte, pais_passaporte
- nis_pis, titulo_eleitor, cadunico
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.types import UUIDType
revision: str = "t0004_patient_documents"
down_revision: str | None = "t0003_patients_expand"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PG_UUID = UUIDType()


def upgrade() -> None:
    # 1. Nova tabela
    op.create_table(
        "patient_documents",
        sa.Column("id", PG_UUID, primary_key=True),
        sa.Column("patient_id", PG_UUID,
                  sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo_documento_id", PG_UUID, nullable=True),
        sa.Column("tipo_codigo",   sa.String(8),   nullable=False, server_default=" "),
        sa.Column("numero",        sa.String(40),  nullable=False, server_default=" "),
        sa.Column("orgao_emissor", sa.String(40),  nullable=False, server_default=" "),
        sa.Column("uf_emissor",    sa.String(2),   nullable=False, server_default=" "),
        sa.Column("pais_emissor",  sa.String(3),   nullable=False, server_default=" "),
        sa.Column("data_emissao",  sa.Date(),      nullable=True),
        sa.Column("data_validade", sa.Date(),      nullable=True),
        sa.Column("observacao",    sa.String(500), nullable=False, server_default=" "),
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_patient_documents_patient_id",  "patient_documents", ["patient_id"])
    op.create_index("ix_patient_documents_tipo_codigo", "patient_documents", ["tipo_codigo"])

    # 2. Drop colunas legacy de patients
    with op.batch_alter_table("patients") as batch:
        for col in [
            "rg", "rg_orgao_emissor", "rg_uf", "rg_data_emissao",
            "tipo_documento_id", "numero_documento",
            "passaporte", "pais_passaporte",
            "nis_pis", "titulo_eleitor", "cadunico",
        ]:
            batch.drop_column(col)


def downgrade() -> None:
    with op.batch_alter_table("patients") as batch:
        batch.add_column(sa.Column("cadunico",          sa.String(15),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("titulo_eleitor",    sa.String(15),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("nis_pis",           sa.String(15),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("pais_passaporte",   sa.String(3),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("passaporte",        sa.String(20),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("numero_documento",  sa.String(40),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("tipo_documento_id", PG_UUID,        nullable=True))
        batch.add_column(sa.Column("rg_data_emissao",   sa.Date(),      nullable=True))
        batch.add_column(sa.Column("rg_uf",             sa.String(2),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("rg_orgao_emissor", sa.String(20),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("rg",                sa.String(20),  nullable=False, server_default=" "))

    op.drop_index("ix_patient_documents_tipo_codigo", table_name="patient_documents")
    op.drop_index("ix_patient_documents_patient_id",  table_name="patient_documents")
    op.drop_table("patient_documents")
