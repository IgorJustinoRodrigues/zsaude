"""Modelo do totem lógico."""

from __future__ import annotations

import uuid

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, text
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
        CheckConstraint(
            "reset_strategy IN ('daily', 'weekly', 'monthly', 'never')",
            name="ck_totens_reset_strategy",
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

    # Personalização da numeração da senha.
    ticket_prefix_normal: Mapped[str] = mapped_column(
        String(5), nullable=False, server_default="R",
    )
    ticket_prefix_priority: Mapped[str] = mapped_column(
        String(5), nullable=False, server_default="P",
    )
    # daily | weekly | monthly | never
    reset_strategy: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="daily",
    )
    number_padding: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="3",
    )

    # Setor pra onde as senhas emitidas vão direto (pula recepção).
    # NULL = padrão (senha entra na fila da Recepção).
    default_sector_name: Mapped[str | None] = mapped_column(
        String(120), nullable=True,
    )


class TotemCounter(Base):
    """Contador sequencial da numeração de senha por ``(totem, prefixo, período)``.

    Sem ``TimestampedMixin`` — a PK composta já identifica tudo. Os
    timestamps são informativos.
    """

    __tablename__ = "totem_counters"

    totem_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("totens.id", ondelete="CASCADE"),
        primary_key=True,
    )
    prefix: Mapped[str] = mapped_column(String(5), primary_key=True)
    period_key: Mapped[str] = mapped_column(String(20), primary_key=True)

    current_number: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0",
    )
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
