"""Modelo ``Attendance`` — jornada do paciente da chegada à alta.

Vive no schema `mun_<ibge>` do município. Começa como emissão de senha
no totem (ou cadastro direto no balcão) e evolui por estados até
cancelamento ou alta.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric,
    SmallInteger, String, Text, text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import JSONType, UUIDType, new_uuid7
from app.tenant_models import TenantBase


class Attendance(TenantBase):
    __tablename__ = "attendances"
    __table_args__ = (
        CheckConstraint(
            "status IN ('reception_waiting', 'reception_called', "
            "'reception_attending', 'sector_waiting', 'triagem_waiting', "
            "'cln_called', 'cln_attending', 'finished', "
            "'evaded', 'referred', "
            "'cancelled', 'evasion')",
            name="ck_attendances_status",
        ),
        CheckConstraint(
            "doc_type IN ('cpf', 'cns', 'manual')",
            name="ck_attendances_doc_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    # Escopo (snapshots; facility/device moram em app schema)
    facility_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False, index=True)
    device_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    # Senha
    ticket_number: Mapped[str] = mapped_column(String(20), nullable=False)
    priority: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )

    # Identificação
    # doc_type: cpf | cns | manual
    doc_type: Mapped[str] = mapped_column(String(10), nullable=False)
    doc_value: Mapped[str | None] = mapped_column(String(15), nullable=True)
    patient_name: Mapped[str] = mapped_column(String(200), nullable=False)
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("patients.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Estado
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="reception_waiting",
    )
    sector_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Grupo prioritário (gestante, idoso, PCD, criança de colo, etc.).
    # FK sem integridade formal — a tabela de domínio nasce na Fase C.
    priority_group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(), nullable=True,
    )

    # Handover (aponta pro antigo atendimento em outra unidade até que a
    # nova recepção confirme presença e assuma).
    needs_handover_from_attendance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(), nullable=True,
    )

    # Timeline
    arrived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    forwarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Quem fez cada transição (app.users — sem FK cross-schema)
    called_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    started_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    forwarded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    cancelled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    cancellation_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # Encaminhamento pra UBS (Fase H). ``referred_to_facility_id`` aponta
    # pra ``app.facilities`` — sem FK formal por ser cross-schema.
    referred_to_facility_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    referred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    referred_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    # ── Helpers ────────────────────────────────────────────────────

    ACTIVE_STATUSES: tuple[str, ...] = (
        "reception_waiting",
        "reception_called",
        "reception_attending",
        "sector_waiting",
        "triagem_waiting",
        "cln_called",
        "cln_attending",
    )

    @property
    def is_active(self) -> bool:
        return self.status in self.ACTIVE_STATUSES


class AttendanceEvent(TenantBase):
    """Linha do tempo granular do atendimento.

    Complementa os timestamps únicos em ``Attendance`` (arrived_at,
    called_at, …) — aqui entra TODA ocorrência: rechamadas, múltiplos
    encaminhamentos, cancelamento com motivo, handover assumido, upload
    de foto durante o fluxo, etc. Ordenada por ``created_at``.

    ``event_type`` valida no código (evita travar evoluções em enum DB):
    ``arrived``, ``called``, ``recalled``, ``started``, ``forwarded``,
    ``cancelled``, ``handover_assumed``, ``photo_uploaded``,
    ``data_updated``, ``note_added``.
    """

    __tablename__ = "attendance_events"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    attendance_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("attendances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    user_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    details: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class PriorityGroup(TenantBase):
    """Grupo prioritário legal por município (tenant).

    Seed inicial: gestante, idoso, PCD, criança de colo.
    Município pode adicionar outros via MASTER.
    """

    __tablename__ = "priority_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False, server_default=" ")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP"),
    )


class AttendanceProcedure(TenantBase):
    """Procedimento SIGTAP marcado num atendimento (Fase F).

    Catálogo SIGTAP vive no schema app — guardamos ``codigo`` +
    ``competencia`` como snapshot (sem FK cross-schema). A descrição é
    resolvida na leitura via join em bulk na tabela ``procedimentos``.

    ``source`` distingue marcação manual do profissional de
    auto-marcações (triagem completa, atendimento finalizado). O
    profissional pode desmarcar uma sugestão automática.
    """

    __tablename__ = "attendance_procedures"
    __table_args__ = (
        CheckConstraint(
            "source IN ('manual','auto_triagem','auto_atendimento')",
            name="ck_attendance_procedures_source",
        ),
        CheckConstraint(
            "quantidade > 0 AND quantidade <= 999",
            name="ck_attendance_procedures_quantidade",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    attendance_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("attendances.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    competencia: Mapped[str] = mapped_column(String(6), nullable=False, server_default="000000")
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    source: Mapped[str] = mapped_column(String(20), nullable=False, server_default="manual")
    marked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    marked_by_user_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    marked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class TriageRecord(TenantBase):
    """Registro de triagem clínica de um atendimento.

    Cada liberação de triagem (``ClnService.triage_and_release``) cria
    UM registro com os sinais vitais aferidos, escala de dor, queixa,
    classificação de risco e observações. Retriagem cria um NOVO
    registro vinculado ao mesmo ``attendance_id`` (histórico preservado).

    ``risk_auto_suggested`` e ``risk_override_reason`` entram em uso na
    Fase G (protocolo Campinas) — por ora ficam null.
    """

    __tablename__ = "triage_records"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    attendance_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("attendances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    queixa: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    observacoes: Mapped[str] = mapped_column(Text, nullable=False, server_default="")

    # Sinais vitais (nullable — profissional preenche o que afere).
    pa_sistolica: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pa_diastolica: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fc: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    temperatura: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    spo2: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    glicemia: Mapped[int | None] = mapped_column(Integer, nullable=True)

    dor: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")

    # Antropometria (Fase D). IMC é calculado no cliente e persistido —
    # garante que o número exibido na tela é o que foi gravado (evita
    # divergência por arredondamento).
    peso: Mapped[Decimal | None]   = mapped_column(Numeric(5, 2), nullable=True)
    altura: Mapped[int | None]     = mapped_column(Integer, nullable=True)
    imc: Mapped[Decimal | None]    = mapped_column(Numeric(5, 2), nullable=True)

    # Perímetros em cm (Fase D).
    perimetro_cefalico: Mapped[Decimal | None]    = mapped_column(Numeric(4, 1), nullable=True)
    perimetro_abdominal: Mapped[Decimal | None]   = mapped_column(Numeric(4, 1), nullable=True)
    perimetro_toracico: Mapped[Decimal | None]    = mapped_column(Numeric(4, 1), nullable=True)
    perimetro_panturrilha: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)

    # Gestação (Fase D). ``gestante`` nullable: null = não perguntado (ex.:
    # sexo M ou ticket anônimo sem aferir); True/False = registrado.
    gestante: Mapped[bool | None]        = mapped_column(Boolean, nullable=True)
    dum: Mapped[date | None]             = mapped_column(Date, nullable=True)
    semanas_gestacao: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # Classificação (1 = Emergência, 5 = Não Urgente).
    risk_classification: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    risk_auto_suggested: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    risk_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Fluxograma do protocolo Campinas usado (ex.: ``dor_toracica``).
    # Null quando o triador classificou livre, sem protocolo.
    complaint_code: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Auditoria.
    triaged_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    triaged_by_user_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
