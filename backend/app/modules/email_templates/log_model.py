"""Modelo ``EmailSendLog``."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UUIDType, new_uuid7


class EmailSendLog(Base):
    """Registro de um envio (tentado ou bem-sucedido) de e-mail.

    Ver migration 0038 pra detalhes do propósito.
    """

    __tablename__ = "email_send_log"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    municipality_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("municipalities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    template_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    to_address: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    from_address: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    subject: Mapped[str] = mapped_column(String(255), nullable=False, server_default=" ")
    message_id: Mapped[str] = mapped_column(String(255), nullable=False, server_default=" ")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="sent")
    error: Mapped[str | None] = mapped_column(Text(), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(200), nullable=True, unique=True,
    )

    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('sent', 'failed', 'skipped')",
            name="ck_email_send_log_status",
        ),
    )
