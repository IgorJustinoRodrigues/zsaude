"""Modelos de tenancy: Municipality, Facility e os acessos do usuário."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import ARRAY, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import new_uuid7


class FacilityType(str, enum.Enum):
    SMS = "SMS"
    UBS = "UBS"
    UPA = "UPA"
    HOSPITAL = "Hospital"
    LAB = "Lab"
    VISA = "VISA"
    POLICLINICA = "Policlínica"
    CEO = "CEO"
    CAPS = "CAPS"
    TRANSPORTES = "Transportes"
    OUTRO = "Outro"


class Municipality(Base, TimestampedMixin):
    __tablename__ = "municipalities"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    ibge: Mapped[str] = mapped_column(String(7), unique=True, nullable=False)

    __table_args__ = (UniqueConstraint("name", "state", name="uq_municipality_name_state"),)


class Facility(Base, TimestampedMixin):
    __tablename__ = "facilities"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    municipality_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str] = mapped_column(String(80), nullable=False)
    type: Mapped[FacilityType] = mapped_column(
        Enum(FacilityType, name="facility_type", native_enum=False, length=20),
        nullable=False,
    )
    cnes: Mapped[str | None] = mapped_column(String(7), nullable=True)


class MunicipalityAccess(Base, TimestampedMixin):
    """Vínculo usuário → município."""

    __tablename__ = "municipality_accesses"
    __table_args__ = (UniqueConstraint("user_id", "municipality_id", name="uq_mun_access_user_mun"),)

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    municipality_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("municipalities.id", ondelete="CASCADE"), nullable=False, index=True
    )


class FacilityAccess(Base, TimestampedMixin):
    """Vínculo usuário → unidade, com papel e módulos permitidos."""

    __tablename__ = "facility_accesses"
    __table_args__ = (UniqueConstraint("user_id", "facility_id", name="uq_fac_access_user_fac"),)

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    facility_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    # ["cln", "dgn", ...]
    modules: Mapped[list[str]] = mapped_column(ARRAY(String(10)), nullable=False, server_default="{}")
