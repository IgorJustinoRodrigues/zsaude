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
from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import JSONType, UUIDType, new_uuid7
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
        UUIDType(), primary_key=True, default=new_uuid7,
    )

    # ── Identificação principal ────────────────────────────────────────
    prontuario: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    social_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    # CPF é opcional para suportar cadastro simplificado / pacientes recém-nascidos.
    # Postgres aceita múltiplos NULLs em UNIQUE por padrão, então o índice
    # único só impede CPFs repetidos quando preenchidos.
    cpf: Mapped[str | None] = mapped_column(String(11), unique=True, nullable=True, index=True)
    cns: Mapped[str | None] = mapped_column(String(15), nullable=True, index=True)

    # Demais documentos (RG, CNH, Passaporte, NIS, Título de eleitor,
    # CadÚnico, etc.) vivem em ``patient_documents`` — múltiplos por paciente.

    # ── Nascimento / sexo / gênero ─────────────────────────────────────
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    sex: Mapped[Sex | None] = mapped_column(
        Enum(Sex, name="patient_sex", native_enum=False, length=1, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    naturalidade_ibge: Mapped[str] = mapped_column(String(7), nullable=False, server_default=" ")
    naturalidade_uf: Mapped[str] = mapped_column(String(2), nullable=False, server_default=" ")
    pais_nascimento: Mapped[str] = mapped_column(String(3), nullable=False, server_default=" ")  # ISO alpha-3

    identidade_genero_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    orientacao_sexual_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    # ── Sociodemográfico ───────────────────────────────────────────────
    nacionalidade_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    raca_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    etnia_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    estado_civil_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    escolaridade_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    religiao_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    povo_tradicional_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    # CBO referencia sigtap_cbos (schema app) — sem FK cross-schema
    cbo_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    ocupacao_livre: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")

    situacao_rua: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    frequenta_escola: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    renda_familiar: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    beneficiario_bolsa_familia: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))

    # ── Endereço ───────────────────────────────────────────────────────
    cep: Mapped[str] = mapped_column(String(8), nullable=False, server_default=" ")
    logradouro_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    endereco: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    numero: Mapped[str] = mapped_column(String(20), nullable=False, server_default=" ")
    complemento: Mapped[str] = mapped_column(String(100), nullable=False, server_default=" ")
    bairro: Mapped[str] = mapped_column(String(100), nullable=False, server_default=" ")
    municipio_ibge: Mapped[str] = mapped_column(String(7), nullable=False, server_default=" ")
    uf: Mapped[str] = mapped_column(String(2), nullable=False, server_default=" ")
    pais: Mapped[str] = mapped_column(String(3), nullable=False, server_default="BRA")  # ISO alpha-3
    area_microarea: Mapped[str] = mapped_column(String(20), nullable=False, server_default=" ")

    # Coordenadas do endereço (geocoding via OSM Nominatim ou ajuste manual).
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)

    # ── Contato ────────────────────────────────────────────────────────
    phone: Mapped[str] = mapped_column(String(20), nullable=False, server_default=" ")
    cellphone: Mapped[str] = mapped_column(String(20), nullable=False, server_default=" ")
    phone_recado: Mapped[str] = mapped_column(String(20), nullable=False, server_default=" ")
    email: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    idioma_preferencial: Mapped[str] = mapped_column(String(10), nullable=False, server_default="pt-BR")

    # ── Filiação / responsável ─────────────────────────────────────────
    mother_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    mother_unknown: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    father_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    father_unknown: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))

    responsavel_nome: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    responsavel_cpf: Mapped[str] = mapped_column(String(11), nullable=False, server_default=" ")
    responsavel_parentesco_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    contato_emergencia_nome: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    contato_emergencia_telefone: Mapped[str] = mapped_column(String(20), nullable=False, server_default=" ")
    contato_emergencia_parentesco_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    # ── Dados clínicos básicos ─────────────────────────────────────────
    tipo_sanguineo_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    alergias: Mapped[str] = mapped_column(String(2000), nullable=False, server_default=" ")
    tem_alergia: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"), index=True)
    doencas_cronicas: Mapped[str] = mapped_column(String(2000), nullable=False, server_default=" ")
    # Lista de UUIDs de ref_deficiencias — múltiplo, guardado em JSONType().
    # ``default=list`` injeta [] no INSERT via Python (em vez de DEFAULT no
    # DDL) — evita conflito com o tipo JSON nativo do Oracle quando a coluna
    # entra num RETURNING.
    deficiencias: Mapped[list] = mapped_column(JSONType(), nullable=False, default=list)
    gestante: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    dum: Mapped[date | None] = mapped_column(Date, nullable=True)  # Data última menstruação
    fumante: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    etilista: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    observacoes_clinicas: Mapped[str] = mapped_column(String(4000), nullable=False, server_default=" ")

    # ── Convênio / plano ───────────────────────────────────────────────
    plano_tipo: Mapped[PlanoSaudeTipo] = mapped_column(
        Enum(PlanoSaudeTipo, name="patient_plano_tipo", native_enum=False, length=15,
             values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        server_default=PlanoSaudeTipo.SUS.value,
    )
    convenio_nome: Mapped[str] = mapped_column(String(120), nullable=False, server_default=" ")
    convenio_numero_carteirinha: Mapped[str] = mapped_column(String(40), nullable=False, server_default=" ")
    convenio_validade: Mapped[date | None] = mapped_column(Date, nullable=True)

    # ── Metadados ──────────────────────────────────────────────────────
    # Referência informativa à facility do schema `app` (sem FK cross-schema).
    unidade_saude_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    # Foto ativa — FK local (mesmo schema).
    current_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("patient_photos.id", ondelete="SET NULL", use_alter=True,
                   name="fk_patients_current_photo_id_patient_photos"),
        nullable=True,
    )

    vinculado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))
    importado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"), index=True)

    # Revisão de identidade — acionada quando o totem detecta enroll
    # com foto muito diferente do embedding atual (anti-spoofing). A
    # recepção revisa o gallery, ajusta a foto oficial, e limpa o flag.
    identity_review_needed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )
    identity_review_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    identity_review_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    data_obito: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_ultima_revisao_cadastro: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observacoes: Mapped[str] = mapped_column(String(4000), nullable=False, server_default=" ")

    # LGPD
    consentimento_lgpd: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    data_consentimento_lgpd: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # UUID do usuário do schema `app` que criou. Sem FK (cross-schema) — só
    # referência informativa. A consistência é garantida na aplicação.
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"),
    )


class PatientPhoto(TenantBase):
    """Fotos do paciente — uma linha por upload.

    A foto ativa é apontada por ``patients.current_photo_id``. Fotos antigas
    permanecem para rastreabilidade e reuso (ex.: recuperar foto apagada).
    """

    __tablename__ = "patient_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # content: bytes da foto no banco. Legacy; novos uploads vão pro S3 e
    # deixam este campo NULL (a key S3 fica em ``files.storage_key`` via FK).
    content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("files.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False, server_default=" ")

    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    uploaded_by_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )

    # Marcada como suspeita pelo enroll facial — a pessoa tentou
    # sobrescrever o embedding com um rosto muito diferente. Recepção
    # revisa, exclui se for spoofing, ou limpa o flag se for legítimo.
    flagged: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )


class PatientFieldChangeType(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    PHOTO_UPLOAD = "photo_upload"
    PHOTO_REMOVE = "photo_remove"
    DOCUMENT_ADD = "document_add"
    DOCUMENT_UPDATE = "document_update"
    DOCUMENT_REMOVE = "document_remove"


class PatientDocument(TenantBase):
    """Documentos do paciente (RG, CNH, Passaporte, etc.).

    Lista dinâmica — um paciente pode ter quantos documentos quiser. CPF e
    CNS continuam direto em ``patients`` por serem chaves de busca/identidade.

    ``tipo_documento_id`` referencia ``app.ref_tipos_documento`` (sem FK
    cross-schema). ``tipo_codigo`` é snapshot pra evitar JOIN em listagens.
    """

    __tablename__ = "patient_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    tipo_documento_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    tipo_codigo: Mapped[str] = mapped_column(String(8), nullable=False, server_default=" ", index=True)

    numero: Mapped[str] = mapped_column(String(40), nullable=False, server_default=" ")
    orgao_emissor: Mapped[str] = mapped_column(String(40), nullable=False, server_default=" ")
    uf_emissor: Mapped[str] = mapped_column(String(2), nullable=False, server_default=" ")
    pais_emissor: Mapped[str] = mapped_column(String(3), nullable=False, server_default=" ")  # ISO alpha-3
    data_emissao: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_validade: Mapped[date | None] = mapped_column(Date, nullable=True)
    observacao: Mapped[str] = mapped_column(String(500), nullable=False, server_default=" ")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"),
    )


class PatientFieldHistory(TenantBase):
    """Histórico por campo do paciente.

    Visível na UI (aba Histórico). Para fotos, ``old_value`` / ``new_value``
    guardam o UUID do ``patient_photos`` — frontend resolve pra thumbnail.
    """

    __tablename__ = "patient_field_history"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
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
    changed_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    changed_by_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    changed_by_role: Mapped[str] = mapped_column(String(100), nullable=False, server_default=" ")

    reason: Mapped[str] = mapped_column(String(500), nullable=False, server_default=" ")
    ip: Mapped[str] = mapped_column(String(45), nullable=False, server_default=" ")
    request_id: Mapped[str] = mapped_column(String(50), nullable=False, server_default=" ")

    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True,
    )
