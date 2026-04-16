"""Pacientes — vive em cada schema de município.

Cada município tem sua própria tabela `patients`. CPF é único dentro do
município; se o mesmo cidadão estiver cadastrado em dois municípios, cada
um tem seu registro independente.

Campos seguem a especificação ampliada do cadastro (eSUS-AB + RNDS + campos
internos). Códigos de domínio apontam para tabelas de referência globais no
schema `app` — não há FK cross-schema; a consistência é garantida na
aplicação.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, LargeBinary, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import new_uuid7
from app.tenant_models import TenantBase


class Sex(str, enum.Enum):
    M = "M"
    F = "F"
    I = "I"  # indeterminado / intersexo


class PlanoSaudeTipo(str, enum.Enum):
    SUS = "SUS"
    PARTICULAR = "PARTICULAR"
    CONVENIO = "CONVENIO"


class Patient(TenantBase):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7,
    )

    # ── Identificação principal ────────────────────────────────────────
    prontuario: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    social_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    cpf: Mapped[str] = mapped_column(String(11), unique=True, nullable=False, index=True)
    cns: Mapped[str | None] = mapped_column(String(15), nullable=True, index=True)

    # Outros documentos
    rg: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    rg_orgao_emissor: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    rg_uf: Mapped[str] = mapped_column(String(2), nullable=False, server_default="")
    rg_data_emissao: Mapped[date | None] = mapped_column(Date, nullable=True)

    tipo_documento_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    numero_documento: Mapped[str] = mapped_column(String(40), nullable=False, server_default="")

    passaporte: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    pais_passaporte: Mapped[str] = mapped_column(String(3), nullable=False, server_default="")  # ISO 3166-1 alpha-3
    nis_pis: Mapped[str] = mapped_column(String(15), nullable=False, server_default="")
    titulo_eleitor: Mapped[str] = mapped_column(String(15), nullable=False, server_default="")
    cadunico: Mapped[str] = mapped_column(String(15), nullable=False, server_default="")

    # ── Nascimento / sexo / gênero ─────────────────────────────────────
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    sex: Mapped[Sex | None] = mapped_column(
        Enum(Sex, name="patient_sex", native_enum=False, length=1, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    naturalidade_ibge: Mapped[str] = mapped_column(String(7), nullable=False, server_default="")
    naturalidade_uf: Mapped[str] = mapped_column(String(2), nullable=False, server_default="")
    pais_nascimento: Mapped[str] = mapped_column(String(3), nullable=False, server_default="")  # ISO alpha-3

    identidade_genero_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    orientacao_sexual_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    # ── Sociodemográfico ───────────────────────────────────────────────
    nacionalidade_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    raca_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    etnia_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    estado_civil_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    escolaridade_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    religiao_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    povo_tradicional_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    # CBO referencia sigtap_cbos (schema app) — sem FK cross-schema
    cbo_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    ocupacao_livre: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")

    situacao_rua: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    frequenta_escola: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    renda_familiar: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    beneficiario_bolsa_familia: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    # ── Endereço ───────────────────────────────────────────────────────
    cep: Mapped[str] = mapped_column(String(8), nullable=False, server_default="")
    logradouro_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    endereco: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    numero: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    complemento: Mapped[str] = mapped_column(String(100), nullable=False, server_default="")
    bairro: Mapped[str] = mapped_column(String(100), nullable=False, server_default="")
    municipio_ibge: Mapped[str] = mapped_column(String(7), nullable=False, server_default="")
    uf: Mapped[str] = mapped_column(String(2), nullable=False, server_default="")
    pais: Mapped[str] = mapped_column(String(3), nullable=False, server_default="BRA")  # ISO alpha-3
    area_microarea: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")

    # ── Contato ────────────────────────────────────────────────────────
    phone: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    cellphone: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    phone_recado: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    email: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    idioma_preferencial: Mapped[str] = mapped_column(String(10), nullable=False, server_default="pt-BR")

    # ── Filiação / responsável ─────────────────────────────────────────
    mother_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    mother_unknown: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    father_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    father_unknown: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    responsavel_nome: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    responsavel_cpf: Mapped[str] = mapped_column(String(11), nullable=False, server_default="")
    responsavel_parentesco_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    contato_emergencia_nome: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    contato_emergencia_telefone: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    contato_emergencia_parentesco_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    # ── Dados clínicos básicos ─────────────────────────────────────────
    tipo_sanguineo_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    alergias: Mapped[str] = mapped_column(String(2000), nullable=False, server_default="")
    tem_alergia: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"), index=True)
    doencas_cronicas: Mapped[str] = mapped_column(String(2000), nullable=False, server_default="")
    # Lista de UUIDs de ref_deficiencias — múltiplo, guardado em JSONB
    deficiencias: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    gestante: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    dum: Mapped[date | None] = mapped_column(Date, nullable=True)  # Data última menstruação
    fumante: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    etilista: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    observacoes_clinicas: Mapped[str] = mapped_column(String(4000), nullable=False, server_default="")

    # ── Convênio / plano ───────────────────────────────────────────────
    plano_tipo: Mapped[PlanoSaudeTipo] = mapped_column(
        Enum(PlanoSaudeTipo, name="patient_plano_tipo", native_enum=False, length=15,
             values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        server_default=PlanoSaudeTipo.SUS.value,
    )
    convenio_nome: Mapped[str] = mapped_column(String(120), nullable=False, server_default="")
    convenio_numero_carteirinha: Mapped[str] = mapped_column(String(40), nullable=False, server_default="")
    convenio_validade: Mapped[date | None] = mapped_column(Date, nullable=True)

    # ── Metadados ──────────────────────────────────────────────────────
    # Referência informativa à facility do schema `app` (sem FK cross-schema).
    unidade_saude_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    # Foto ativa — FK local (mesmo schema).
    current_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patient_photos.id", ondelete="SET NULL", use_alter=True,
                   name="fk_patients_current_photo_id_patient_photos"),
        nullable=True,
    )

    vinculado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    importado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"), index=True)

    data_obito: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_ultima_revisao_cadastro: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observacoes: Mapped[str] = mapped_column(String(4000), nullable=False, server_default="")

    # LGPD
    consentimento_lgpd: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    data_consentimento_lgpd: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # UUID do usuário do schema `app` que criou. Sem FK (cross-schema) — só
    # referência informativa. A consistência é garantida na aplicação.
    created_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"),
    )


class PatientPhoto(TenantBase):
    """Fotos do paciente — uma linha por upload.

    A foto ativa é apontada por ``patients.current_photo_id``. Fotos antigas
    permanecem para rastreabilidade e reuso (ex.: recuperar foto apagada).
    """

    __tablename__ = "patient_photos"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")

    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    uploaded_by_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )


class PatientFieldChangeType(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    PHOTO_UPLOAD = "photo_upload"
    PHOTO_REMOVE = "photo_remove"


class PatientFieldHistory(TenantBase):
    """Histórico por campo do paciente.

    Visível na UI (aba Histórico). Para fotos, ``old_value`` / ``new_value``
    guardam o UUID do ``patient_photos`` — frontend resolve pra thumbnail.
    """

    __tablename__ = "patient_field_history"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    field_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    old_value: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    new_value: Mapped[str | None] = mapped_column(String(4000), nullable=True)

    change_type: Mapped[PatientFieldChangeType] = mapped_column(
        Enum(
            PatientFieldChangeType, name="patient_field_change_type",
            native_enum=False, length=20,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        server_default=PatientFieldChangeType.UPDATE.value,
    )

    # Snapshot do usuário (cross-schema; sem FK)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    changed_by_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    changed_by_role: Mapped[str] = mapped_column(String(100), nullable=False, server_default="")

    reason: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    ip: Mapped[str] = mapped_column(String(45), nullable=False, server_default="")
    request_id: Mapped[str] = mapped_column(String(50), nullable=False, server_default="")

    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"), index=True,
    )
