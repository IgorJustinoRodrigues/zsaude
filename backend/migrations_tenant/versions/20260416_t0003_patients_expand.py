"""Amplia patients (campos completos) + cria patient_photos e patient_field_history

Revision ID: t0002_patients_expand
Revises: t0001_patients
Create Date: 2026-04-16

Cadastro completo do paciente (HSP/CLN compartilhado). Inclui:

- 40+ colunas novas em ``patients`` (identificação, sociodemográfico,
  endereço, filiação, contatos, clínico básico, convênio, LGPD).
- Tabela ``patient_photos`` — foto em bytea, uma linha por upload.
- Tabela ``patient_field_history`` — auditoria campo-a-campo visível na UI.

Sem ``schema=``: roda no ``search_path`` do município.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.types import JSONType, UUIDType
revision: str = "t0003_patients_expand"
down_revision: str | None = "t0002_cnes_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PG_UUID = UUIDType()


def upgrade() -> None:
    # ── 1. Novas colunas em `patients` ────────────────────────────────
    with op.batch_alter_table("patients") as batch:
        # Identificação
        batch.add_column(sa.Column("social_name",           sa.String(200), nullable=False, server_default=" "))
        batch.add_column(sa.Column("rg",                    sa.String(20),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("rg_orgao_emissor",      sa.String(20),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("rg_uf",                 sa.String(2),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("rg_data_emissao",       sa.Date(),      nullable=True))
        batch.add_column(sa.Column("tipo_documento_id",     PG_UUID,        nullable=True))
        batch.add_column(sa.Column("numero_documento",      sa.String(40),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("passaporte",            sa.String(20),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("pais_passaporte",       sa.String(3),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("nis_pis",               sa.String(15),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("titulo_eleitor",        sa.String(15),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("cadunico",              sa.String(15),  nullable=False, server_default=" "))

        # Nascimento
        batch.add_column(sa.Column("naturalidade_ibge",     sa.String(7),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("naturalidade_uf",       sa.String(2),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("pais_nascimento",       sa.String(3),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("identidade_genero_id",  PG_UUID,        nullable=True))
        batch.add_column(sa.Column("orientacao_sexual_id",  PG_UUID,        nullable=True))

        # Sociodemográfico
        batch.add_column(sa.Column("nacionalidade_id",      PG_UUID, nullable=True))
        batch.add_column(sa.Column("raca_id",               PG_UUID, nullable=True))
        batch.add_column(sa.Column("etnia_id",              PG_UUID, nullable=True))
        batch.add_column(sa.Column("estado_civil_id",       PG_UUID, nullable=True))
        batch.add_column(sa.Column("escolaridade_id",       PG_UUID, nullable=True))
        batch.add_column(sa.Column("religiao_id",           PG_UUID, nullable=True))
        batch.add_column(sa.Column("povo_tradicional_id",   PG_UUID, nullable=True))
        batch.add_column(sa.Column("cbo_id",                PG_UUID, nullable=True))
        batch.add_column(sa.Column("ocupacao_livre",        sa.String(200), nullable=False, server_default=" "))
        batch.add_column(sa.Column("situacao_rua",          sa.Boolean(),   nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("frequenta_escola",      sa.Boolean(),   nullable=True))
        batch.add_column(sa.Column("renda_familiar",        sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("beneficiario_bolsa_familia", sa.Boolean(), nullable=False, server_default=sa.text("false")))

        # Endereço
        batch.add_column(sa.Column("cep",                   sa.String(8),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("logradouro_id",         PG_UUID,        nullable=True))
        batch.add_column(sa.Column("endereco",              sa.String(200), nullable=False, server_default=" "))
        batch.add_column(sa.Column("numero",                sa.String(20),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("complemento",           sa.String(100), nullable=False, server_default=" "))
        batch.add_column(sa.Column("bairro",                sa.String(100), nullable=False, server_default=" "))
        batch.add_column(sa.Column("municipio_ibge",        sa.String(7),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("uf",                    sa.String(2),   nullable=False, server_default=" "))
        batch.add_column(sa.Column("pais",                  sa.String(3),   nullable=False, server_default="BRA"))
        batch.add_column(sa.Column("area_microarea",        sa.String(20),  nullable=False, server_default=" "))

        # Contato (phone e email já existem)
        batch.add_column(sa.Column("cellphone",             sa.String(20),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("phone_recado",          sa.String(20),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("idioma_preferencial",   sa.String(10),  nullable=False, server_default="pt-BR"))

        # Filiação / responsável
        batch.add_column(sa.Column("mother_unknown",        sa.Boolean(),   nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("father_unknown",        sa.Boolean(),   nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("responsavel_nome",      sa.String(200), nullable=False, server_default=" "))
        batch.add_column(sa.Column("responsavel_cpf",       sa.String(11),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("responsavel_parentesco_id", PG_UUID, nullable=True))
        batch.add_column(sa.Column("contato_emergencia_nome",      sa.String(200), nullable=False, server_default=" "))
        batch.add_column(sa.Column("contato_emergencia_telefone",  sa.String(20),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("contato_emergencia_parentesco_id", PG_UUID, nullable=True))

        # Clínico básico
        batch.add_column(sa.Column("tipo_sanguineo_id",     PG_UUID, nullable=True))
        batch.add_column(sa.Column("alergias",              sa.String(2000), nullable=False, server_default=" "))
        batch.add_column(sa.Column("tem_alergia",           sa.Boolean(),    nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("doencas_cronicas",      sa.String(2000), nullable=False, server_default=" "))
        batch.add_column(sa.Column("deficiencias",          JSONType, nullable=False, server_default=sa.text("'[]'")))
        batch.add_column(sa.Column("gestante",              sa.Boolean(),    nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("dum",                   sa.Date(),       nullable=True))
        batch.add_column(sa.Column("fumante",               sa.Boolean(),    nullable=True))
        batch.add_column(sa.Column("etilista",              sa.Boolean(),    nullable=True))
        batch.add_column(sa.Column("observacoes_clinicas",  sa.String(4000), nullable=False, server_default=" "))

        # Convênio
        batch.add_column(sa.Column("plano_tipo",                    sa.String(15), nullable=False, server_default="SUS"))
        batch.add_column(sa.Column("convenio_nome",                 sa.String(120), nullable=False, server_default=" "))
        batch.add_column(sa.Column("convenio_numero_carteirinha",   sa.String(40),  nullable=False, server_default=" "))
        batch.add_column(sa.Column("convenio_validade",             sa.Date(),      nullable=True))

        # Metadados
        batch.add_column(sa.Column("unidade_saude_id",           PG_UUID, nullable=True))
        batch.add_column(sa.Column("current_photo_id",           PG_UUID, nullable=True))
        batch.add_column(sa.Column("vinculado",                  sa.Boolean(), nullable=False, server_default=sa.text("true")))
        batch.add_column(sa.Column("importado",                  sa.Boolean(), nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("data_obito",                 sa.Date(),     nullable=True))
        batch.add_column(sa.Column("data_ultima_revisao_cadastro", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("observacoes",                sa.String(4000), nullable=False, server_default=" "))
        batch.add_column(sa.Column("consentimento_lgpd",         sa.Boolean(), nullable=False, server_default=sa.text("false")))
        batch.add_column(sa.Column("data_consentimento_lgpd",    sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("updated_by",                 PG_UUID, nullable=True))

    # Amplia enum do sexo: adicionar "I" (intersexo/indeterminado). Como o enum
    # é native_enum=False (VARCHAR com CHECK), nada a fazer no banco — o CHECK
    # não existe, a constraint de valores fica no pydantic.

    op.create_index("ix_patients_birth_date", "patients", ["birth_date"])
    op.create_index("ix_patients_tem_alergia", "patients", ["tem_alergia"])

    # ── 2. Tabela patient_photos ──────────────────────────────────────
    op.create_table(
        "patient_photos",
        sa.Column("id",                PG_UUID, primary_key=True),
        sa.Column("patient_id",        PG_UUID, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content",           sa.LargeBinary(), nullable=False),
        sa.Column("mime_type",         sa.String(50),    nullable=False),
        sa.Column("file_size",         sa.Integer(),     nullable=False, server_default="0"),
        sa.Column("width",             sa.Integer(),     nullable=True),
        sa.Column("height",            sa.Integer(),     nullable=True),
        sa.Column("checksum_sha256",   sa.String(64),    nullable=False, server_default=" "),
        sa.Column("uploaded_by",       PG_UUID,          nullable=True),
        sa.Column("uploaded_by_name",  sa.String(200),   nullable=False, server_default=" "),
        sa.Column("uploaded_at",       sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_patient_photos_patient_id", "patient_photos", ["patient_id"])

    # FK de patients.current_photo_id → patient_photos.id (depois de criada)
    op.create_foreign_key(
        "fk_patients_current_photo_id_patient_photos",
        "patients", "patient_photos",
        ["current_photo_id"], ["id"],
        ondelete="SET NULL",
    )

    # ── 3. Tabela patient_field_history ───────────────────────────────
    op.create_table(
        "patient_field_history",
        sa.Column("id",                PG_UUID, primary_key=True),
        sa.Column("patient_id",        PG_UUID, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_name",        sa.String(80),   nullable=False),
        sa.Column("old_value",         sa.String(4000), nullable=True),
        sa.Column("new_value",         sa.String(4000), nullable=True),
        sa.Column("change_type",       sa.String(20),   nullable=False, server_default="update"),
        sa.Column("changed_by",        PG_UUID,         nullable=True),
        sa.Column("changed_by_name",   sa.String(200),  nullable=False, server_default=" "),
        sa.Column("changed_by_role",   sa.String(100),  nullable=False, server_default=" "),
        sa.Column("reason",            sa.String(500),  nullable=False, server_default=" "),
        sa.Column("ip",                sa.String(45),   nullable=False, server_default=" "),
        sa.Column("request_id",        sa.String(50),   nullable=False, server_default=" "),
        sa.Column("changed_at",        sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_patient_field_history_patient_id", "patient_field_history", ["patient_id"])
    op.create_index("ix_patient_field_history_field_name", "patient_field_history", ["field_name"])
    op.create_index("ix_patient_field_history_changed_at", "patient_field_history", ["changed_at"])


def downgrade() -> None:
    op.drop_index("ix_patient_field_history_changed_at", table_name="patient_field_history")
    op.drop_index("ix_patient_field_history_field_name", table_name="patient_field_history")
    op.drop_index("ix_patient_field_history_patient_id", table_name="patient_field_history")
    op.drop_table("patient_field_history")

    op.drop_constraint("fk_patients_current_photo_id_patient_photos", "patients", type_="foreignkey")
    op.drop_index("ix_patient_photos_patient_id", table_name="patient_photos")
    op.drop_table("patient_photos")

    op.drop_index("ix_patients_tem_alergia", table_name="patients")
    op.drop_index("ix_patients_birth_date", table_name="patients")

    with op.batch_alter_table("patients") as batch:
        for col in [
            "updated_by", "data_consentimento_lgpd", "consentimento_lgpd", "observacoes",
            "data_ultima_revisao_cadastro", "data_obito", "importado", "vinculado",
            "current_photo_id", "unidade_saude_id",
            "convenio_validade", "convenio_numero_carteirinha", "convenio_nome", "plano_tipo",
            "observacoes_clinicas", "etilista", "fumante", "dum", "gestante",
            "deficiencias", "doencas_cronicas", "tem_alergia", "alergias", "tipo_sanguineo_id",
            "contato_emergencia_parentesco_id", "contato_emergencia_telefone", "contato_emergencia_nome",
            "responsavel_parentesco_id", "responsavel_cpf", "responsavel_nome",
            "father_unknown", "mother_unknown",
            "idioma_preferencial", "phone_recado", "cellphone",
            "area_microarea", "pais", "uf", "municipio_ibge", "bairro", "complemento",
            "numero", "endereco", "logradouro_id", "cep",
            "beneficiario_bolsa_familia", "renda_familiar", "frequenta_escola", "situacao_rua",
            "ocupacao_livre", "cbo_id", "povo_tradicional_id", "religiao_id",
            "escolaridade_id", "estado_civil_id", "etnia_id", "raca_id", "nacionalidade_id",
            "orientacao_sexual_id", "identidade_genero_id",
            "pais_nascimento", "naturalidade_uf", "naturalidade_ibge",
            "cadunico", "titulo_eleitor", "nis_pis", "pais_passaporte", "passaporte",
            "numero_documento", "tipo_documento_id",
            "rg_data_emissao", "rg_uf", "rg_orgao_emissor", "rg", "social_name",
        ]:
            batch.drop_column(col)
