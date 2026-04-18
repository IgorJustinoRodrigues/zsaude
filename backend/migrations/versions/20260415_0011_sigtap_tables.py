"""Tabelas SIGTAP (Tabela Unificada de Procedimentos SUS)

Revision ID: 0011_sigtap_tables
Revises: 0010_mun_enabled_modules
Create Date: 2026-04-15

Catálogo nacional de procedimentos — a mesma tabela serve todos os
municípios. Todas as tabelas vivem em ``app.*``. Fonte: pacote ZIP do
DATASUS com 21 arquivos posicionais, publicado mensalmente por competência.

Estrutura:
- **Mestras**: ``sigtap_procedures``, ``sigtap_cbos``, ``sigtap_cids``,
  ``sigtap_modalidades``, ``sigtap_registros``, ``sigtap_services``,
  ``sigtap_service_classifications``, ``sigtap_procedure_descriptions``,
  ``sigtap_formas_organizacao``, ``sigtap_habilitacoes``,
  ``sigtap_grupos_habilitacao``.
- **Relações**: ``sigtap_procedure_cids``, ``sigtap_procedure_cbos``,
  ``sigtap_procedure_modalidades``, ``sigtap_procedure_registros``,
  ``sigtap_procedure_compatibilidades``, ``sigtap_procedure_detalhes``,
  ``sigtap_procedure_servicos``, ``sigtap_procedure_leitos``,
  ``sigtap_procedure_regras_cond``, ``sigtap_procedure_habilitacoes``.
- **Histórico**: ``sigtap_imports`` + ``sigtap_import_files``.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.types import JSONType, UUIDType
revision: str = "0011_sigtap_tables"
down_revision: str | None = "0010_mun_enabled_modules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")

    # ── sigtap_procedures ──
    op.create_table(
        "sigtap_procedures",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(10), nullable=False),
        sa.Column("nome", sa.String(250), nullable=False, server_default=" "),
        sa.Column("complexidade", sa.String(1), nullable=False, server_default=" "),
        sa.Column("sexo", sa.String(1), nullable=False, server_default=" "),
        sa.Column("qt_maxima", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("qt_dias", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("qt_pontos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("idade_minima", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("idade_maxima", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valor_sh", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("valor_sa", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("valor_sp", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("id_financiamento", sa.String(2), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("revogado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name="uq_sigtap_procedures_codigo"),
        schema="app",
    )
    op.create_index("ix_sigtap_procedures_revogado", "sigtap_procedures", ["revogado"], schema="app")
    op.create_index("ix_sigtap_procedures_competencia", "sigtap_procedures", ["competencia"], schema="app")

    # ── sigtap_cbos ──
    op.create_table(
        "sigtap_cbos",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(6), nullable=False),
        sa.Column("descricao", sa.String(200), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name="uq_sigtap_cbos_codigo"),
        schema="app",
    )

    # ── sigtap_cids ──
    op.create_table(
        "sigtap_cids",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(4), nullable=False),
        sa.Column("descricao", sa.String(200), nullable=False, server_default=" "),
        sa.Column("agravo", sa.String(1), nullable=False, server_default=" "),
        sa.Column("sexo", sa.String(1), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name="uq_sigtap_cids_codigo"),
        schema="app",
    )

    # ── sigtap_modalidades ──
    op.create_table(
        "sigtap_modalidades",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(2), nullable=False),
        sa.Column("descricao", sa.String(200), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name="uq_sigtap_modalidades_codigo"),
        schema="app",
    )

    # ── sigtap_registros ──
    op.create_table(
        "sigtap_registros",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(2), nullable=False),
        sa.Column("descricao", sa.String(100), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name="uq_sigtap_registros_codigo"),
        schema="app",
    )

    # ── sigtap_services ──
    op.create_table(
        "sigtap_services",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(3), nullable=False),
        sa.Column("descricao", sa.String(200), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name="uq_sigtap_services_codigo"),
        schema="app",
    )

    # ── sigtap_service_classifications ──
    op.create_table(
        "sigtap_service_classifications",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_servico", sa.String(3), nullable=False),
        sa.Column("codigo_classificacao", sa.String(3), nullable=False),
        sa.Column("descricao", sa.String(200), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_servico", "codigo_classificacao",
            name="uq_sigtap_service_classifications_servico_class",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_service_classifications_codigo_servico",
        "sigtap_service_classifications", ["codigo_servico"], schema="app",
    )

    # ── sigtap_procedure_descriptions ──
    op.create_table(
        "sigtap_procedure_descriptions",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo_procedimento", name="uq_sigtap_procedure_descriptions_codigo_procedimento"),
        schema="app",
    )

    # ── sigtap_formas_organizacao ──
    op.create_table(
        "sigtap_formas_organizacao",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_grupo", sa.String(2), nullable=False),
        sa.Column("codigo_subgrupo", sa.String(2), nullable=False),
        sa.Column("codigo_forma", sa.String(2), nullable=False),
        sa.Column("descricao", sa.String(200), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_grupo", "codigo_subgrupo", "codigo_forma",
            name="uq_sigtap_formas_organizacao_grupo_subgrupo_forma",
        ),
        schema="app",
    )

    # ── sigtap_habilitacoes ──
    op.create_table(
        "sigtap_habilitacoes",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(4), nullable=False),
        sa.Column("descricao", sa.String(200), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name="uq_sigtap_habilitacoes_codigo"),
        schema="app",
    )

    # ── sigtap_grupos_habilitacao ──
    op.create_table(
        "sigtap_grupos_habilitacao",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(4), nullable=False),
        sa.Column("nome_grupo", sa.String(40), nullable=False, server_default=" "),
        sa.Column("descricao", sa.String(300), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name="uq_sigtap_grupos_habilitacao_codigo"),
        schema="app",
    )

    # ── sigtap_procedure_cids ──
    op.create_table(
        "sigtap_procedure_cids",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("codigo_cid", sa.String(4), nullable=False),
        sa.Column("principal", sa.String(1), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "codigo_cid",
            name="uq_sigtap_procedure_cids_proc_cid",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_cids_codigo_procedimento",
        "sigtap_procedure_cids", ["codigo_procedimento"], schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_cids_codigo_cid",
        "sigtap_procedure_cids", ["codigo_cid"], schema="app",
    )

    # ── sigtap_procedure_cbos ──
    op.create_table(
        "sigtap_procedure_cbos",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("codigo_cbo", sa.String(6), nullable=False),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "codigo_cbo",
            name="uq_sigtap_procedure_cbos_proc_cbo",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_cbos_codigo_procedimento",
        "sigtap_procedure_cbos", ["codigo_procedimento"], schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_cbos_codigo_cbo",
        "sigtap_procedure_cbos", ["codigo_cbo"], schema="app",
    )

    # ── sigtap_procedure_modalidades ──
    op.create_table(
        "sigtap_procedure_modalidades",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("codigo_modalidade", sa.String(2), nullable=False),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "codigo_modalidade",
            name="uq_sigtap_procedure_modalidades_proc_modal",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_modalidades_codigo_procedimento",
        "sigtap_procedure_modalidades", ["codigo_procedimento"], schema="app",
    )

    # ── sigtap_procedure_registros ──
    op.create_table(
        "sigtap_procedure_registros",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("codigo_registro", sa.String(2), nullable=False),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "codigo_registro",
            name="uq_sigtap_procedure_registros_proc_reg",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_registros_codigo_procedimento",
        "sigtap_procedure_registros", ["codigo_procedimento"], schema="app",
    )

    # ── sigtap_procedure_compatibilidades ──
    op.create_table(
        "sigtap_procedure_compatibilidades",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("registro_principal", sa.String(2), nullable=False, server_default=" "),
        sa.Column("codigo_procedimento_secundario", sa.String(10), nullable=False),
        sa.Column("registro_secundario", sa.String(2), nullable=False, server_default=" "),
        sa.Column("tipo_compatibilidade", sa.String(1), nullable=False, server_default=" "),
        sa.Column("quantidade_permitida", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "registro_principal",
            "codigo_procedimento_secundario", "registro_secundario",
            name="uq_sigtap_procedure_compatibilidades_key",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_compatibilidades_codigo_procedimento",
        "sigtap_procedure_compatibilidades", ["codigo_procedimento"], schema="app",
    )

    # ── sigtap_procedure_detalhes ──
    op.create_table(
        "sigtap_procedure_detalhes",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("codigo_lista_validacao", sa.String(3), nullable=False),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "codigo_lista_validacao",
            name="uq_sigtap_procedure_detalhes_proc_lista",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_detalhes_codigo_procedimento",
        "sigtap_procedure_detalhes", ["codigo_procedimento"], schema="app",
    )

    # ── sigtap_procedure_servicos ──
    op.create_table(
        "sigtap_procedure_servicos",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("codigo_servico", sa.String(3), nullable=False),
        sa.Column("codigo_classificacao", sa.String(3), nullable=False),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "codigo_servico", "codigo_classificacao",
            name="uq_sigtap_procedure_servicos_proc_serv_class",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_servicos_codigo_procedimento",
        "sigtap_procedure_servicos", ["codigo_procedimento"], schema="app",
    )

    # ── sigtap_procedure_leitos ──
    op.create_table(
        "sigtap_procedure_leitos",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("codigo_tipo_leito", sa.String(2), nullable=False),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "codigo_tipo_leito",
            name="uq_sigtap_procedure_leitos_proc_leito",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_leitos_codigo_procedimento",
        "sigtap_procedure_leitos", ["codigo_procedimento"], schema="app",
    )

    # ── sigtap_procedure_regras_cond ──
    op.create_table(
        "sigtap_procedure_regras_cond",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("regra_condicionada", sa.String(14), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "regra_condicionada",
            name="uq_sigtap_procedure_regras_cond_proc_regra",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_regras_cond_codigo_procedimento",
        "sigtap_procedure_regras_cond", ["codigo_procedimento"], schema="app",
    )

    # ── sigtap_procedure_habilitacoes ──
    op.create_table(
        "sigtap_procedure_habilitacoes",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo_procedimento", sa.String(10), nullable=False),
        sa.Column("codigo_habilitacao", sa.String(4), nullable=False),
        sa.Column("codigo_grupo_habilitacao", sa.String(4), nullable=False, server_default=" "),
        sa.Column("competencia", sa.String(6), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "codigo_procedimento", "codigo_habilitacao", "codigo_grupo_habilitacao",
            name="uq_sigtap_procedure_habilitacoes_proc_hab_grupo",
        ),
        schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_habilitacoes_codigo_procedimento",
        "sigtap_procedure_habilitacoes", ["codigo_procedimento"], schema="app",
    )
    op.create_index(
        "ix_sigtap_procedure_habilitacoes_codigo_habilitacao",
        "sigtap_procedure_habilitacoes", ["codigo_habilitacao"], schema="app",
    )

    # ── sigtap_imports (histórico) ──
    op.create_table(
        "sigtap_imports",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("competencia", sa.String(6), nullable=False),
        sa.Column("uploaded_by_user_id", UUIDType(), nullable=True),
        sa.Column("uploaded_by_user_name", sa.String(200), nullable=False, server_default=" "),
        sa.Column("zip_filename", sa.String(200), nullable=False, server_default=" "),
        sa.Column("zip_size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(10), nullable=False, server_default="running"),
        sa.Column("error_message", sa.String(2000), nullable=False, server_default=" "),
        sa.Column("total_rows_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('running','success','failed','partial')",
            name="ck_sigtap_imports_status",
        ),
        schema="app",
    )
    op.create_index("ix_sigtap_imports_competencia", "sigtap_imports", ["competencia"], schema="app")
    op.create_index("ix_sigtap_imports_status", "sigtap_imports", ["status"], schema="app")

    # ── sigtap_import_files ──
    op.create_table(
        "sigtap_import_files",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "import_id",
            UUIDType(),
            sa.ForeignKey(
                "app.sigtap_imports.id",
                ondelete="CASCADE",
                name="fk_sigtap_import_files_import_id",
            ),
            nullable=False,
        ),
        sa.Column("filename", sa.String(80), nullable=False),
        sa.Column("rows_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_inserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warnings", JSONType(), nullable=False, server_default="[]"),
        sa.Column("error_message", sa.String(2000), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        schema="app",
    )
    op.create_index("ix_sigtap_import_files_import_id", "sigtap_import_files", ["import_id"], schema="app")


def downgrade() -> None:
    op.drop_index("ix_sigtap_import_files_import_id", table_name="sigtap_import_files", schema="app")
    op.drop_table("sigtap_import_files", schema="app")
    op.drop_index("ix_sigtap_imports_status", table_name="sigtap_imports", schema="app")
    op.drop_index("ix_sigtap_imports_competencia", table_name="sigtap_imports", schema="app")
    op.drop_table("sigtap_imports", schema="app")

    op.drop_index("ix_sigtap_procedure_habilitacoes_codigo_habilitacao", table_name="sigtap_procedure_habilitacoes", schema="app")
    op.drop_index("ix_sigtap_procedure_habilitacoes_codigo_procedimento", table_name="sigtap_procedure_habilitacoes", schema="app")
    op.drop_table("sigtap_procedure_habilitacoes", schema="app")

    op.drop_index("ix_sigtap_procedure_regras_cond_codigo_procedimento", table_name="sigtap_procedure_regras_cond", schema="app")
    op.drop_table("sigtap_procedure_regras_cond", schema="app")

    op.drop_index("ix_sigtap_procedure_leitos_codigo_procedimento", table_name="sigtap_procedure_leitos", schema="app")
    op.drop_table("sigtap_procedure_leitos", schema="app")

    op.drop_index("ix_sigtap_procedure_servicos_codigo_procedimento", table_name="sigtap_procedure_servicos", schema="app")
    op.drop_table("sigtap_procedure_servicos", schema="app")

    op.drop_index("ix_sigtap_procedure_detalhes_codigo_procedimento", table_name="sigtap_procedure_detalhes", schema="app")
    op.drop_table("sigtap_procedure_detalhes", schema="app")

    op.drop_index("ix_sigtap_procedure_compatibilidades_codigo_procedimento", table_name="sigtap_procedure_compatibilidades", schema="app")
    op.drop_table("sigtap_procedure_compatibilidades", schema="app")

    op.drop_index("ix_sigtap_procedure_registros_codigo_procedimento", table_name="sigtap_procedure_registros", schema="app")
    op.drop_table("sigtap_procedure_registros", schema="app")

    op.drop_index("ix_sigtap_procedure_modalidades_codigo_procedimento", table_name="sigtap_procedure_modalidades", schema="app")
    op.drop_table("sigtap_procedure_modalidades", schema="app")

    op.drop_index("ix_sigtap_procedure_cbos_codigo_cbo", table_name="sigtap_procedure_cbos", schema="app")
    op.drop_index("ix_sigtap_procedure_cbos_codigo_procedimento", table_name="sigtap_procedure_cbos", schema="app")
    op.drop_table("sigtap_procedure_cbos", schema="app")

    op.drop_index("ix_sigtap_procedure_cids_codigo_cid", table_name="sigtap_procedure_cids", schema="app")
    op.drop_index("ix_sigtap_procedure_cids_codigo_procedimento", table_name="sigtap_procedure_cids", schema="app")
    op.drop_table("sigtap_procedure_cids", schema="app")

    op.drop_table("sigtap_grupos_habilitacao", schema="app")
    op.drop_table("sigtap_habilitacoes", schema="app")
    op.drop_table("sigtap_formas_organizacao", schema="app")
    op.drop_table("sigtap_procedure_descriptions", schema="app")

    op.drop_index("ix_sigtap_service_classifications_codigo_servico", table_name="sigtap_service_classifications", schema="app")
    op.drop_table("sigtap_service_classifications", schema="app")

    op.drop_table("sigtap_services", schema="app")
    op.drop_table("sigtap_registros", schema="app")
    op.drop_table("sigtap_modalidades", schema="app")
    op.drop_table("sigtap_cids", schema="app")
    op.drop_table("sigtap_cbos", schema="app")

    op.drop_index("ix_sigtap_procedures_competencia", table_name="sigtap_procedures", schema="app")
    op.drop_index("ix_sigtap_procedures_revogado", table_name="sigtap_procedures", schema="app")
    op.drop_table("sigtap_procedures", schema="app")
