"""Pacientes — vive em cada schema de município.

Cada município tem sua própria tabela `patients`. CPF é único dentro do
município; se o mesmo cidadão estiver cadastrado em dois municípios, cada
um tem seu registro independente.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import new_uuid7
from app.tenant_models import TenantBase


class Sex(str, enum.Enum):
    M = "M"
    F = "F"


class Patient(TenantBase):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7,
    )

    # Número de prontuário local ao município. Deixo como string agora;
    # geração automática por sequence vai num patch posterior.
    prontuario: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    cpf: Mapped[str] = mapped_column(String(11), unique=True, nullable=False, index=True)
    cns: Mapped[str | None] = mapped_column(String(15), nullable=True, index=True)

    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[Sex | None] = mapped_column(
        Enum(Sex, name="patient_sex", native_enum=False, length=1, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )

    phone: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
    email: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")

    mother_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    father_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"), index=True)

    # UUID do usuário do schema `app` que criou. Sem FK (cross-schema) — só
    # referência informativa. A consistência é garantida na aplicação.
    created_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"),
    )
