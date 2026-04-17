"""Habilitações da unidade (lfces045.txt). DELETE+INSERT por unidade."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, text

from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import UUIDType, new_uuid7
from app.tenant_models import TenantBase


class CnesUnitQualification(TenantBase):
    __tablename__ = "cnes_unit_qualifications"
    __table_args__ = (
        UniqueConstraint("id_unidade", "codigo_habilitacao", name="uq_cnes_unit_qual"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    id_unidade: Mapped[str] = mapped_column(String(31), nullable=False, index=True)
    codigo_habilitacao: Mapped[str] = mapped_column(String(4), nullable=False)

    competencia_ultima_importacao: Mapped[str] = mapped_column(String(6), nullable=False, server_default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
