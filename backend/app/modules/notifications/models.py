"""Modelo ``Notification`` — central de notificações persistente."""

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
from app.db.types import JSONType, UUIDType, new_uuid7


class Notification(Base):
    """Notificação direcionada a um usuário.

    Ciclo de vida:

    - Criada via ``NotificationService.notify(...)``.
    - Aparece no sino + tela ``/notificacoes`` do usuário.
    - ``read_at`` preenchido quando o user clica (não some da lista).
    - ``dismissed_at`` preenchido quando o user descarta explicitamente
      (some da lista).

    Dedup: ``dedup_key`` permite "notificar que está faltando CNES" sem
    spammar — ``notify()`` só insere se não há uma com mesmo
    ``(user_id, dedup_key)`` ainda não lida/dismissed.
    """

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(10), nullable=False, server_default="info")
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text(), nullable=False)
    data: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)
    dedup_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        CheckConstraint(
            "type IN ('info','success','warning','error')",
            name="ck_notifications_type",
        ),
    )
