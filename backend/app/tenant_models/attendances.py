"""Modelo ``Attendance`` — jornada do paciente da chegada à alta.

Vive no schema `mun_<ibge>` do município. Começa como emissão de senha
no totem (ou cadastro direto no balcão) e evolui por estados até
cancelamento ou alta.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, String, text,
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
