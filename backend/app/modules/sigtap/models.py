"""Modelos SIGTAP — catálogo nacional de procedimentos SUS.

Todas as tabelas vivem em ``app.*``. Herda de ``Base`` (schema padrão ``app``).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import JSONType, UUIDType, new_uuid7


# ─────────────────────────────────────────────────────────────────────
# Mestras


class SigtapProcedure(Base):
    __tablename__ = "sigtap_procedures"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    nome: Mapped[str] = mapped_column(String(250), nullable=False, server_default=" ")
    complexidade: Mapped[str] = mapped_column(String(1), nullable=False, server_default=" ")
    sexo: Mapped[str] = mapped_column(String(1), nullable=False, server_default=" ")
    qt_maxima: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    qt_dias: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    qt_pontos: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    idade_minima: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    idade_maxima: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    valor_sh: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")
    valor_sa: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")
    valor_sp: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")
    id_financiamento: Mapped[str] = mapped_column(String(2), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ", index=True)
    revogado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapCbo(Base):
    __tablename__ = "sigtap_cbos"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo: Mapped[str] = mapped_column(String(6), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapCid(Base):
    __tablename__ = "sigtap_cids"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo: Mapped[str] = mapped_column(String(4), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    agravo: Mapped[str] = mapped_column(String(1), nullable=False, server_default=" ")
    sexo: Mapped[str] = mapped_column(String(1), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapModalidade(Base):
    __tablename__ = "sigtap_modalidades"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo: Mapped[str] = mapped_column(String(2), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapRegistro(Base):
    __tablename__ = "sigtap_registros"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo: Mapped[str] = mapped_column(String(2), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(String(100), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapService(Base):
    __tablename__ = "sigtap_services"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo: Mapped[str] = mapped_column(String(3), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapServiceClassification(Base):
    __tablename__ = "sigtap_service_classifications"
    __table_args__ = (
        UniqueConstraint(
            "codigo_servico", "codigo_classificacao",
            name="uq_sigtap_service_classifications_servico_class",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_servico: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    codigo_classificacao: Mapped[str] = mapped_column(String(3), nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureDescription(Base):
    __tablename__ = "sigtap_procedure_descriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(Text, nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapFormaOrganizacao(Base):
    __tablename__ = "sigtap_formas_organizacao"
    __table_args__ = (
        UniqueConstraint(
            "codigo_grupo", "codigo_subgrupo", "codigo_forma",
            name="uq_sigtap_formas_organizacao_grupo_subgrupo_forma",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_grupo: Mapped[str] = mapped_column(String(2), nullable=False)
    codigo_subgrupo: Mapped[str] = mapped_column(String(2), nullable=False)
    codigo_forma: Mapped[str] = mapped_column(String(2), nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapHabilitacao(Base):
    __tablename__ = "sigtap_habilitacoes"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo: Mapped[str] = mapped_column(String(4), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapGrupoHabilitacao(Base):
    __tablename__ = "sigtap_grupos_habilitacao"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo: Mapped[str] = mapped_column(String(4), nullable=False, unique=True)
    nome_grupo: Mapped[str] = mapped_column(String(40), nullable=False, server_default=" ")
    descricao: Mapped[str] = mapped_column(String(300), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


# ─────────────────────────────────────────────────────────────────────
# Relações (DELETE + INSERT)


class SigtapProcedureCid(Base):
    __tablename__ = "sigtap_procedure_cids"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "codigo_cid",
            name="uq_sigtap_procedure_cids_proc_cid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    codigo_cid: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    principal: Mapped[str] = mapped_column(String(1), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureCbo(Base):
    __tablename__ = "sigtap_procedure_cbos"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "codigo_cbo",
            name="uq_sigtap_procedure_cbos_proc_cbo",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    codigo_cbo: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureModalidade(Base):
    __tablename__ = "sigtap_procedure_modalidades"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "codigo_modalidade",
            name="uq_sigtap_procedure_modalidades_proc_modal",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    codigo_modalidade: Mapped[str] = mapped_column(String(2), nullable=False)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureRegistro(Base):
    __tablename__ = "sigtap_procedure_registros"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "codigo_registro",
            name="uq_sigtap_procedure_registros_proc_reg",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    codigo_registro: Mapped[str] = mapped_column(String(2), nullable=False)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureCompatibilidade(Base):
    __tablename__ = "sigtap_procedure_compatibilidades"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "registro_principal",
            "codigo_procedimento_secundario", "registro_secundario",
            name="uq_sigtap_procedure_compatibilidades_key",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    registro_principal: Mapped[str] = mapped_column(String(2), nullable=False, server_default=" ")
    codigo_procedimento_secundario: Mapped[str] = mapped_column(String(10), nullable=False)
    registro_secundario: Mapped[str] = mapped_column(String(2), nullable=False, server_default=" ")
    tipo_compatibilidade: Mapped[str] = mapped_column(String(1), nullable=False, server_default=" ")
    quantidade_permitida: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureDetalhe(Base):
    __tablename__ = "sigtap_procedure_detalhes"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "codigo_lista_validacao",
            name="uq_sigtap_procedure_detalhes_proc_lista",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    codigo_lista_validacao: Mapped[str] = mapped_column(String(3), nullable=False)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureServico(Base):
    __tablename__ = "sigtap_procedure_servicos"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "codigo_servico", "codigo_classificacao",
            name="uq_sigtap_procedure_servicos_proc_serv_class",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    codigo_servico: Mapped[str] = mapped_column(String(3), nullable=False)
    codigo_classificacao: Mapped[str] = mapped_column(String(3), nullable=False)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureLeito(Base):
    __tablename__ = "sigtap_procedure_leitos"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "codigo_tipo_leito",
            name="uq_sigtap_procedure_leitos_proc_leito",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    codigo_tipo_leito: Mapped[str] = mapped_column(String(2), nullable=False)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureRegraCond(Base):
    __tablename__ = "sigtap_procedure_regras_cond"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "regra_condicionada",
            name="uq_sigtap_procedure_regras_cond_proc_regra",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    regra_condicionada: Mapped[str] = mapped_column(String(14), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SigtapProcedureHabilitacao(Base):
    __tablename__ = "sigtap_procedure_habilitacoes"
    __table_args__ = (
        UniqueConstraint(
            "codigo_procedimento", "codigo_habilitacao", "codigo_grupo_habilitacao",
            name="uq_sigtap_procedure_habilitacoes_proc_hab_grupo",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    codigo_procedimento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    codigo_habilitacao: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    codigo_grupo_habilitacao: Mapped[str] = mapped_column(String(4), nullable=False, server_default=" ")
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


# ─────────────────────────────────────────────────────────────────────
# Histórico


class SigtapImportStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


class SigtapImport(Base):
    """Registro de uma importação SIGTAP — cabeçalho."""

    __tablename__ = "sigtap_imports"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running','success','failed','partial')",
            name="ck_sigtap_imports_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    uploaded_by_user_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    zip_filename: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    zip_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    status: Mapped[SigtapImportStatus] = mapped_column(
        Enum(
            SigtapImportStatus,
            name="sigtap_import_status",
            native_enum=False,
            length=10,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        server_default=SigtapImportStatus.RUNNING.value,
        index=True,
    )
    error_message: Mapped[str] = mapped_column(String(2000), nullable=False, server_default=" ")
    total_rows_processed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SigtapImportFile(Base):
    """Log por arquivo dentro de uma importação."""

    __tablename__ = "sigtap_import_files"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    import_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("app.sigtap_imports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(80), nullable=False)
    rows_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    rows_inserted: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    rows_updated: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    rows_skipped: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    warnings: Mapped[list] = mapped_column(JSONType(), nullable=False, default=list)
    error_message: Mapped[str] = mapped_column(String(2000), nullable=False, server_default=" ")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
