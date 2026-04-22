"""Schemas I/O do módulo HSP (paciente)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel
from app.tenant_models.patients import PatientFieldChangeType, PlanoSaudeTipo, Sex


class PatientBase(CamelModel):
    """Campos comuns a Create/Update/Read — todos opcionais aqui; Create
    marca os obrigatórios."""

    # Identificação
    prontuario: str | None = Field(default=None, max_length=20)
    name: str | None = Field(default=None, max_length=200)
    social_name: str = Field(default="", max_length=200)
    cpf: str | None = Field(default=None, min_length=11, max_length=11)
    cns: str | None = Field(default=None, max_length=15)
    # Demais documentos vivem em PatientDocument (lista no Read/Update).

    # Nascimento
    birth_date: date | None = None
    sex: Sex | None = None
    naturalidade_ibge: str = Field(default="", max_length=7)
    naturalidade_uf: str = Field(default="", max_length=2)
    pais_nascimento: str = Field(default="", max_length=3)
    identidade_genero_id: UUID | None = None
    orientacao_sexual_id: UUID | None = None

    # Sociodemográfico
    nacionalidade_id: UUID | None = None
    raca_id: UUID | None = None
    etnia_id: UUID | None = None
    estado_civil_id: UUID | None = None
    escolaridade_id: UUID | None = None
    religiao_id: UUID | None = None
    povo_tradicional_id: UUID | None = None
    cbo_id: UUID | None = None
    ocupacao_livre: str = Field(default="", max_length=200)
    situacao_rua: bool = False
    frequenta_escola: bool | None = None
    renda_familiar: float | None = None
    beneficiario_bolsa_familia: bool = False

    # Endereço
    cep: str = Field(default="", max_length=8)
    logradouro_id: UUID | None = None
    endereco: str = Field(default="", max_length=200)
    numero: str = Field(default="", max_length=20)
    complemento: str = Field(default="", max_length=100)
    bairro: str = Field(default="", max_length=100)
    municipio_ibge: str = Field(default="", max_length=7)
    uf: str = Field(default="", max_length=2)
    pais: str = Field(default="BRA", max_length=3)
    area_microarea: str = Field(default="", max_length=20)
    latitude: float | None = None
    longitude: float | None = None

    # Contato
    phone: str = Field(default="", max_length=20)
    cellphone: str = Field(default="", max_length=20)
    phone_recado: str = Field(default="", max_length=20)
    email: str = Field(default="", max_length=200)
    idioma_preferencial: str = Field(default="pt-BR", max_length=10)

    # Filiação
    mother_name: str = Field(default="", max_length=200)
    mother_unknown: bool = False
    father_name: str | None = Field(default=None, max_length=200)
    father_unknown: bool = False
    responsavel_nome: str = Field(default="", max_length=200)
    responsavel_cpf: str = Field(default="", max_length=11)
    responsavel_parentesco_id: UUID | None = None
    contato_emergencia_nome: str = Field(default="", max_length=200)
    contato_emergencia_telefone: str = Field(default="", max_length=20)
    contato_emergencia_parentesco_id: UUID | None = None

    # Clínico
    tipo_sanguineo_id: UUID | None = None
    alergias: str = Field(default="", max_length=2000)
    tem_alergia: bool = False
    doencas_cronicas: str = Field(default="", max_length=2000)
    deficiencias: list[UUID] = Field(default_factory=list)
    gestante: bool = False
    dum: date | None = None
    fumante: bool | None = None
    etilista: bool | None = None
    observacoes_clinicas: str = Field(default="", max_length=4000)

    # Convênio
    plano_tipo: PlanoSaudeTipo = PlanoSaudeTipo.SUS
    convenio_nome: str = Field(default="", max_length=120)
    convenio_numero_carteirinha: str = Field(default="", max_length=40)
    convenio_validade: date | None = None

    # Metadados
    unidade_saude_id: UUID | None = None
    vinculado: bool = True
    observacoes: str = Field(default="", max_length=4000)
    consentimento_lgpd: bool = False


class DocumentBase(CamelModel):
    """Documento do paciente (RG, CNH, Passaporte, etc.)."""
    tipo_documento_id: UUID | None = None
    tipo_codigo: str = Field(default="", max_length=8)
    numero: str = Field(default="", max_length=40)
    orgao_emissor: str = Field(default="", max_length=40)
    uf_emissor: str = Field(default="", max_length=2)
    pais_emissor: str = Field(default="", max_length=3)
    data_emissao: date | None = None
    data_validade: date | None = None
    observacao: str = Field(default="", max_length=500)


class DocumentInput(DocumentBase):
    """Item enviado pelo client. Se ``id`` vier, atualiza; senão cria."""
    id: UUID | None = None


class DocumentOut(DocumentBase):
    id: UUID
    patient_id: UUID
    created_at: datetime
    updated_at: datetime


class PatientCreate(PatientBase):
    """Cria paciente.

    Apenas ``name`` é obrigatório. CPF, sexo, etc. podem ser preenchidos
    no cadastro simplificado e completados depois pela tela de edição.
    """
    name: str = Field(..., min_length=2, max_length=200)
    cpf: str | None = Field(default=None, min_length=11, max_length=11)
    prontuario: str | None = Field(default=None, max_length=20)
    documents: list[DocumentInput] = Field(default_factory=list)


class PatientUpdate(PatientBase):
    """Todos os campos opcionais para PATCH parcial.

    Se ``documents`` vier (não-None), o backend faz reconciliação:
    - itens com ``id`` que existem → update
    - itens sem ``id`` → criar
    - documentos atuais cujo id não está no payload → remover
    """
    reason: str | None = Field(default=None, max_length=500)
    documents: list[DocumentInput] | None = None


class PatientListItem(CamelModel):
    id: UUID
    prontuario: str
    name: str
    social_name: str
    cpf: str | None = None
    cns: str | None = None
    birth_date: date | None = None
    sex: Sex | None = None
    cellphone: str
    phone: str
    active: bool
    has_photo: bool = False
    identity_review_needed: bool = False
    created_at: datetime
    updated_at: datetime


class PatientRead(PatientBase):
    id: UUID
    active: bool
    importado: bool
    data_obito: date | None = None
    data_ultima_revisao_cadastro: datetime | None = None
    data_consentimento_lgpd: datetime | None = None
    current_photo_id: UUID | None = None
    has_photo: bool = False
    # Flag de revisão de identidade — setado quando o totem detecta
    # spoofing em potencial. Recepção limpa via endpoint dedicado.
    identity_review_needed: bool = False
    identity_review_reason: str | None = None
    identity_review_at: datetime | None = None
    created_by: UUID | None = None
    updated_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    documents: list[DocumentOut] = Field(default_factory=list)
    # Presente apenas na resposta do POST /patients/{id}/photo (enrollment
    # facial automático). Nos outros endpoints volta None.
    face_enrollment_status: Literal[
        "ok", "no_face", "low_quality", "error", "disabled"
    ] | None = None


class PatientPhotoOut(CamelModel):
    id: UUID
    patient_id: UUID
    mime_type: str
    file_size: int
    width: int | None = None
    height: int | None = None
    uploaded_by: UUID | None = None
    uploaded_by_name: str
    uploaded_at: datetime
    # Suspeita — setado quando o totem enrollou uma foto muito
    # diferente do embedding. Recepção decide se é spoofing ou mudança
    # legítima (ajuste de threshold ou clear manual).
    flagged: bool = False
    # Status do enrollment facial feito automaticamente no upload.
    # Presente só no POST /photo; GET/lista devolve None.
    face_status: Literal[
        "ok", "no_face", "low_quality", "error", "disabled", "duplicate", "mismatch",
    ] | None = None
    # Quando ``face_status='duplicate'``, identifica o paciente cuja face
    # bateu acima do threshold. Frontend mostra alerta e admin decide.
    face_duplicate_of: dict | None = None


class PatientAddressInput(CamelModel):
    """Payload de criação/edição de endereço secundário."""
    label: str
    cep: str = ""
    endereco: str = ""
    numero: str = ""
    complemento: str = ""
    bairro: str = ""
    municipio_ibge: str = ""
    uf: str = ""
    pais: str = "BRA"
    observacao: str = ""


class PatientAddressOut(CamelModel):
    id: UUID
    patient_id: UUID
    label: str
    cep: str
    endereco: str
    numero: str
    complemento: str
    bairro: str
    municipio_ibge: str
    uf: str
    pais: str
    observacao: str
    display_order: int
    created_at: datetime
    updated_at: datetime


class PatientFieldHistoryOut(CamelModel):
    id: UUID
    patient_id: UUID
    field_name: str
    old_value: str | None = None
    new_value: str | None = None
    change_type: PatientFieldChangeType
    changed_by: UUID | None = None
    changed_by_name: str
    changed_by_role: str
    reason: str
    changed_at: datetime
