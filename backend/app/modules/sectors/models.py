"""Modelo de setor (scoped: município ou unidade)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import UUIDType, new_uuid7


class Sector(Base, TimestampedMixin):
    __tablename__ = "sectors"
    __table_args__ = (
        CheckConstraint(
            "scope_type IN ('municipality', 'facility')",
            name="ck_sectors_scope_type",
        ),
        UniqueConstraint(
            "scope_type", "scope_id", "name",
            name="uq_sectors_scope_name",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    # ``scope_type``: 'municipality' ou 'facility'. ``scope_id`` aponta pro
    # id daquela entidade — sem FK pra evitar CASCADE complexo (deletar o
    # escopo deleta os setores manualmente no service).
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    # Ordem de exibição dentro do escopo — inteiro crescente.
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Ignorado; só pra TypeChecker entender.
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
