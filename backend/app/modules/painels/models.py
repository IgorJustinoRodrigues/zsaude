"""Modelo do painel de chamada lógico."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import JSONType, UUIDType, new_uuid7


class Painel(Base, TimestampedMixin):
    __tablename__ = "painels"
    __table_args__ = (
        CheckConstraint(
            "scope_type IN ('municipality', 'facility')",
            name="ck_painels_scope_type",
        ),
        CheckConstraint(
            "mode IN ('senha', 'nome', 'ambos')",
            name="ck_painels_mode_valid",
        ),
        UniqueConstraint(
            "scope_type", "scope_id", "name",
            name="uq_painels_scope_name",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, server_default="senha")
    announce_audio: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"),
    )
    # Snapshot dos nomes de setores — lista vazia = mostra qualquer chamada.
    sector_names: Mapped[list] = mapped_column(JSONType(), nullable=False, default=list)
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )
