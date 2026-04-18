"""Leitos (lfces002.txt). DELETE+INSERT por unidade a cada import."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, text

from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import UUIDType, new_uuid7
from app.tenant_models import TenantBase


class CnesUnitBed(TenantBase):
    __tablename__ = "cnes_unit_beds"
    __table_args__ = (
        UniqueConstraint("id_unidade", "id_leito", "id_tipo_leito", name="uq_cnes_bed"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    id_unidade: Mapped[str] = mapped_column(String(31), nullable=False, index=True)
    id_leito: Mapped[str] = mapped_column(String(2), nullable=False)
    id_tipo_leito: Mapped[str] = mapped_column(String(2), nullable=False)

    quantidade_existente: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    quantidade_sus: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    competencia_ultima_importacao: Mapped[str] = mapped_column(String(6), nullable=False, server_default=" ")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
