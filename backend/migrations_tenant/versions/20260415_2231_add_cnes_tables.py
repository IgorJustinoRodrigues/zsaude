"""Cria tabelas CNES no schema do município

Revision ID: t0002_cnes_tables
Revises: t0001_patients
Create Date: 2026-04-15

Tabelas do snapshot CNES (SCNES/DATASUS):
- cnes_units, cnes_professionals, cnes_professional_unit
- cnes_unit_beds, cnes_unit_services, cnes_unit_qualifications
- cnes_teams, cnes_team_professionals
- cnes_imports + cnes_import_files (histórico)

Todas vivem no schema `mun_<ibge>` (search_path via env do Alembic tenant).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.types import JSONType, UUIDType
revision: str = "t0002_cnes_tables"
down_revision: str | None = "t0001_patients"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── cnes_units ──
    op.create_table(
        "cnes_units",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("id_unidade", sa.String(31), nullable=False),
        sa.Column("cnes", sa.String(7), nullable=False),
        sa.Column("cnpj_mantenedora", sa.String(14), nullable=False, server_default=" "),
        sa.Column("razao_social", sa.String(200), nullable=False, server_default=" "),
        sa.Column("nome_fantasia", sa.String(200), nullable=False, server_default=" "),
        sa.Column("cpf", sa.String(11), nullable=False, server_default=" "),
        sa.Column("cnpj", sa.String(14), nullable=False, server_default=" "),
        sa.Column("tipo_unidade", sa.String(2), nullable=False, server_default=" "),
        sa.Column("estado", sa.String(2), nullable=False, server_default=" "),
        sa.Column("codigo_ibge", sa.String(7), nullable=False),
        sa.Column("competencia_ultima_importacao", sa.String(6), nullable=False, server_default=" "),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cnes_units_id_unidade", "cnes_units", ["id_unidade"], unique=True)
    op.create_index("ix_cnes_units_cnes", "cnes_units", ["cnes"], unique=True)
    op.create_index("ix_cnes_units_codigo_ibge", "cnes_units", ["codigo_ibge"])
    op.create_index("ix_cnes_units_active", "cnes_units", ["active"])

    # ── cnes_professionals ──
    op.create_table(
        "cnes_professionals",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("id_profissional", sa.String(16), nullable=False),
        sa.Column("cpf", sa.String(11), nullable=False, server_default=" "),
        sa.Column("cns", sa.String(15), nullable=False, server_default=" "),
        sa.Column("nome", sa.String(200), nullable=False, server_default=" "),
        sa.Column("status", sa.String(20), nullable=False, server_default="Ativo"),
        sa.Column("competencia_ultima_importacao", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cnes_professionals_id_profissional", "cnes_professionals", ["id_profissional"], unique=True)
    op.create_index("ix_cnes_professionals_cpf", "cnes_professionals", ["cpf"])
    op.create_index("ix_cnes_professionals_cns", "cnes_professionals", ["cns"])

    # ── cnes_professional_unit ──
    op.create_table(
        "cnes_professional_unit",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("id_profissional", sa.String(16), nullable=False),
        sa.Column("id_unidade", sa.String(31), nullable=False),
        sa.Column("id_cbo", sa.String(6), nullable=False),
        sa.Column("carga_horaria_ambulatorial", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("carga_horaria_hospitalar", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id_conselho", sa.String(2), nullable=False, server_default=" "),
        sa.Column("num_conselho", sa.String(10), nullable=False, server_default=" "),
        sa.Column("status", sa.String(20), nullable=False, server_default="Ativo"),
        sa.Column("competencia_ultima_importacao", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("id_profissional", "id_unidade", "id_cbo", name="uq_cnes_prof_unit_cbo"),
    )
    op.create_index("ix_cnes_professional_unit_id_profissional", "cnes_professional_unit", ["id_profissional"])
    op.create_index("ix_cnes_professional_unit_id_unidade", "cnes_professional_unit", ["id_unidade"])
    op.create_index("ix_cnes_professional_unit_status", "cnes_professional_unit", ["status"])

    # ── cnes_unit_beds ──
    op.create_table(
        "cnes_unit_beds",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("id_unidade", sa.String(31), nullable=False),
        sa.Column("id_leito", sa.String(2), nullable=False),
        sa.Column("id_tipo_leito", sa.String(2), nullable=False),
        sa.Column("quantidade_existente", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quantidade_sus", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("competencia_ultima_importacao", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("id_unidade", "id_leito", "id_tipo_leito", name="uq_cnes_bed"),
    )
    op.create_index("ix_cnes_unit_beds_id_unidade", "cnes_unit_beds", ["id_unidade"])

    # ── cnes_unit_services ──
    op.create_table(
        "cnes_unit_services",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("id_unidade", sa.String(31), nullable=False),
        sa.Column("id_servico", sa.String(3), nullable=False),
        sa.Column("id_classificacao", sa.String(3), nullable=False),
        sa.Column("competencia_ultima_importacao", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("id_unidade", "id_servico", "id_classificacao", name="uq_cnes_unit_service"),
    )
    op.create_index("ix_cnes_unit_services_id_unidade", "cnes_unit_services", ["id_unidade"])

    # ── cnes_teams ──
    op.create_table(
        "cnes_teams",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_ibge", sa.String(6), nullable=False),
        sa.Column("codigo_area", sa.String(4), nullable=False),
        sa.Column("sequencial_equipe", sa.String(8), nullable=False),
        sa.Column("id_unidade", sa.String(31), nullable=False),
        sa.Column("tipo_equipe", sa.String(2), nullable=False),
        sa.Column("nome_equipe", sa.String(200), nullable=False, server_default=" "),
        sa.Column("competencia_ultima_importacao", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo_ibge", "codigo_area", "sequencial_equipe", name="uq_cnes_team"),
    )
    op.create_index("ix_cnes_teams_codigo_ibge", "cnes_teams", ["codigo_ibge"])
    op.create_index("ix_cnes_teams_id_unidade", "cnes_teams", ["id_unidade"])

    # ── cnes_team_professionals ──
    op.create_table(
        "cnes_team_professionals",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_ibge", sa.String(6), nullable=False),
        sa.Column("codigo_area", sa.String(4), nullable=False),
        sa.Column("sequencial_equipe", sa.String(8), nullable=False),
        sa.Column("id_profissional", sa.String(16), nullable=False),
        sa.Column("id_unidade", sa.String(31), nullable=False),
        sa.Column("codigo_cbo", sa.String(6), nullable=False),
        sa.Column("competencia_ultima_importacao", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_ibge", "codigo_area", "sequencial_equipe",
            "id_profissional", "codigo_cbo",
            name="uq_cnes_team_prof",
        ),
    )
    op.create_index("ix_cnes_team_professionals_codigo_ibge", "cnes_team_professionals", ["codigo_ibge"])
    op.create_index("ix_cnes_team_professionals_id_profissional", "cnes_team_professionals", ["id_profissional"])
    op.create_index("ix_cnes_team_professionals_id_unidade", "cnes_team_professionals", ["id_unidade"])

    # ── cnes_unit_qualifications ──
    op.create_table(
        "cnes_unit_qualifications",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("id_unidade", sa.String(31), nullable=False),
        sa.Column("codigo_habilitacao", sa.String(4), nullable=False),
        sa.Column("competencia_ultima_importacao", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("id_unidade", "codigo_habilitacao", name="uq_cnes_unit_qual"),
    )
    op.create_index("ix_cnes_unit_qualifications_id_unidade", "cnes_unit_qualifications", ["id_unidade"])

    # ── cnes_imports (histórico) ──
    op.create_table(
        "cnes_imports",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("competencia", sa.String(6), nullable=False),
        sa.Column("uploaded_by_user_id", UUIDType(), nullable=True),
        sa.Column("uploaded_by_user_name", sa.String(200), nullable=False, server_default=" "),
        sa.Column("zip_filename", sa.String(200), nullable=False, server_default=" "),
        sa.Column("zip_size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(10), nullable=False, server_default="running"),
        sa.Column("error_message", sa.String(2000), nullable=False, server_default=" "),
        sa.Column("total_rows_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('running','success','failed','partial')",
            name="ck_cnes_imports_status",
        ),
    )
    op.create_index("ix_cnes_imports_competencia", "cnes_imports", ["competencia"])
    op.create_index("ix_cnes_imports_status", "cnes_imports", ["status"])

    # ── cnes_import_files (log por arquivo) ──
    op.create_table(
        "cnes_import_files",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "import_id",
            UUIDType(),
            sa.ForeignKey("cnes_imports.id", ondelete="CASCADE", name="fk_cnes_import_files_import_id"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(60), nullable=False),
        sa.Column("rows_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_inserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warnings", JSONType(), nullable=False, server_default="[]"),
        sa.Column("error_message", sa.String(2000), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cnes_import_files_import_id", "cnes_import_files", ["import_id"])


def downgrade() -> None:
    op.drop_index("ix_cnes_import_files_import_id", table_name="cnes_import_files")
    op.drop_table("cnes_import_files")
    op.drop_index("ix_cnes_imports_status", table_name="cnes_imports")
    op.drop_index("ix_cnes_imports_competencia", table_name="cnes_imports")
    op.drop_table("cnes_imports")
    op.drop_index("ix_cnes_unit_qualifications_id_unidade", table_name="cnes_unit_qualifications")
    op.drop_table("cnes_unit_qualifications")
    op.drop_index("ix_cnes_team_professionals_id_unidade", table_name="cnes_team_professionals")
    op.drop_index("ix_cnes_team_professionals_id_profissional", table_name="cnes_team_professionals")
    op.drop_index("ix_cnes_team_professionals_codigo_ibge", table_name="cnes_team_professionals")
    op.drop_table("cnes_team_professionals")
    op.drop_index("ix_cnes_teams_id_unidade", table_name="cnes_teams")
    op.drop_index("ix_cnes_teams_codigo_ibge", table_name="cnes_teams")
    op.drop_table("cnes_teams")
    op.drop_index("ix_cnes_unit_services_id_unidade", table_name="cnes_unit_services")
    op.drop_table("cnes_unit_services")
    op.drop_index("ix_cnes_unit_beds_id_unidade", table_name="cnes_unit_beds")
    op.drop_table("cnes_unit_beds")
    op.drop_index("ix_cnes_professional_unit_status", table_name="cnes_professional_unit")
    op.drop_index("ix_cnes_professional_unit_id_unidade", table_name="cnes_professional_unit")
    op.drop_index("ix_cnes_professional_unit_id_profissional", table_name="cnes_professional_unit")
    op.drop_table("cnes_professional_unit")
    op.drop_index("ix_cnes_professionals_cns", table_name="cnes_professionals")
    op.drop_index("ix_cnes_professionals_cpf", table_name="cnes_professionals")
    op.drop_index("ix_cnes_professionals_id_profissional", table_name="cnes_professionals")
    op.drop_table("cnes_professionals")
    op.drop_index("ix_cnes_units_active", table_name="cnes_units")
    op.drop_index("ix_cnes_units_codigo_ibge", table_name="cnes_units")
    op.drop_index("ix_cnes_units_cnes", table_name="cnes_units")
    op.drop_index("ix_cnes_units_id_unidade", table_name="cnes_units")
    op.drop_table("cnes_units")
