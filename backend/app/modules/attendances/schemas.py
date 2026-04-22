"""DTOs de atendimentos."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


Status = Literal[
    "reception_waiting",
    "reception_called",
    "reception_attending",
    "triagem_waiting",
    "cancelled",
    "evasion",
]

DocType = Literal["cpf", "cns", "manual"]


class EmitTicketInput(CamelModel):
    """Entrada do totem quando o paciente finaliza o autoatendimento."""

    doc_type: DocType
    # null só quando doc_type == 'manual'
    doc_value: str | None = Field(default=None, max_length=15)
    patient_name: str = Field(min_length=1, max_length=200)
    priority: bool = False
    # Quando a identidade foi confirmada por match facial, o totem manda
    # o ``patient_id`` direto — backend resolve CPF/CNS do cadastro pra
    # não expor esses dados em tela limpa.
    patient_id: UUID | None = None


class HandoverInfo(CamelModel):
    """Info sobre o atendimento que o paciente tinha em outra unidade."""

    attendance_id: UUID
    facility_name: str
    facility_short_name: str
    status: Status
    started_at: datetime


class EmitTicketOutput(CamelModel):
    """Retorno ao totem — o que exibir pro paciente."""

    id: UUID
    ticket_number: str
    priority: bool
    patient_name: str
    # ``patient_id`` resolvido (se o doc bateu com algum cadastro ou o
    # totem já enviou via face match). Totem usa isso pra vincular a
    # foto capturada ao paciente (learning facial).
    patient_id: UUID | None = None
    # Se o paciente já tinha atendimento em outra unidade, a recepção
    # precisa confirmar presença antes de atender. O totem pode mostrar
    # uma mensagem específica avisando.
    handover: HandoverInfo | None = None


class AttendanceRead(CamelModel):
    id: UUID
    facility_id: UUID
    device_id: UUID | None = None
    ticket_number: str
    priority: bool
    doc_type: DocType
    doc_value: str | None = None
    patient_name: str
    patient_id: UUID | None = None
    status: Status
    sector_name: str | None = None
    needs_handover_from_attendance_id: UUID | None = None
    arrived_at: datetime
    called_at: datetime | None = None
    started_at: datetime | None = None
    forwarded_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None


class OrderReason(CamelModel):
    """Explicação de uma contribuição ao score no modo 'ai'. A recepção
    exibe num tooltip: 'por que esse antes daquele'."""

    tag: str
    contrib: float
    note: str | None = None


class AttendanceListItem(AttendanceRead):
    """Item pra lista da recepção — inclui dados do handover pra badge."""

    handover: HandoverInfo | None = None
    # Preenchido só quando ``queue_order_mode='ai'`` — razões que
    # contribuíram pro score desse ticket na ordenação atual.
    order_reasons: list[OrderReason] = []


class ForwardInput(CamelModel):
    sector_name: str = Field(min_length=1, max_length=120)


class CancelInput(CamelModel):
    reason: str = Field(default="", max_length=300)


class AlreadyExistsError(CamelModel):
    """Body de erro 409 — paciente já tem atendimento ativo aqui."""

    code: Literal["already_exists_here"] = "already_exists_here"
    existing_ticket: str
    existing_status: Status
    arrived_at: datetime


# ─── Face (totem) ────────────────────────────────────────────────────────────

class ActiveTicketInfo(CamelModel):
    """Info resumida de atendimento ativo que o totem exibe na
    confirmação pra evitar emitir senha duplicada."""

    ticket_number: str
    status: Status
    facility_short_name: str
    same_facility: bool


class FaceCandidate(CamelModel):
    patient_id: UUID
    name: str
    social_name: str | None = None
    cpf_masked: str | None = None
    cns_masked: str | None = None
    similarity: float
    has_photo: bool
    # Preenchido quando o paciente já tem atendimento ativo neste
    # município. Totem usa pra pular prioridade quando ``same_facility``.
    active_ticket: ActiveTicketInfo | None = None


class FaceMatchOutput(CamelModel):
    """Retorno do match. Frontend aplica a regra "1 candidato e score >=
    0.60" pra decidir se pergunta ao paciente — aqui retorno todos pra
    manter flexibilidade."""

    face_detected: bool
    detection_score: float | None = None
    candidates: list[FaceCandidate] = []
