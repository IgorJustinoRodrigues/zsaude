"""Modelo do totem lógico."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import JSONType, UUIDType, new_uuid7


class Totem(Base, TimestampedMixin):
    __tablename__ = "totens"
    __table_args__ = (
        CheckConstraint(
            "scope_type IN ('municipality', 'facility')",
            name="ck_totens_scope_type",
        ),
        UniqueConstraint(
            "scope_type", "scope_id", "name",
            name="uq_totens_scope_name",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # { cpf, cns, face, manual_name } como dict.
    capture: Mapped[dict] = mapped_column(JSONType(), nullable=False, default=dict)
    priority_prompt: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"),
    )
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )
