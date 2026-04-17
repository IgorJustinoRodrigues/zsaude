"""Serviço/classificação (lfces032.txt)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, text

from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import UUIDType, new_uuid7
from app.tenant_models import TenantBase


class CnesUnitService(TenantBase):
    __tablename__ = "cnes_unit_services"
    __table_args__ = (
        UniqueConstraint("id_unidade", "id_servico", "id_classificacao", name="uq_cnes_unit_service"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    id_unidade: Mapped[str] = mapped_column(String(31), nullable=False, index=True)
    id_servico: Mapped[str] = mapped_column(String(3), nullable=False)
    id_classificacao: Mapped[str] = mapped_column(String(3), nullable=False)

    competencia_ultima_importacao: Mapped[str] = mapped_column(String(6), nullable=False, server_default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
