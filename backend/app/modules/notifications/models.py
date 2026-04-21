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
    # Corpo extenso (opcional) — mostrado no modal de detalhe.
    body: Mapped[str | None] = mapped_column(Text(), nullable=True)
    # CTA opcional: quando preenchidos, detail view exibe um botão que
    # navega pra ``action_url`` (rota interna ou URL externa).
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    action_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    data: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)
    dedup_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Autor: None = sistema automático. UUID = usuário que gerou (broadcast
    # manual via UI de admin).
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    # Aponta pra notification_broadcasts quando a notif veio de um envio
    # em massa — permite agregar stats de leitura por broadcast.
    broadcast_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("notification_broadcasts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
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


class NotificationBroadcast(Base):
    """Metadata de um envio em massa. Cada row tem N ``Notification``s
    filhas (uma por destinatário no escopo)."""

    __tablename__ = "notification_broadcasts"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    # all | municipality | facility | user
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    # Snapshot legível do escopo ("Goiânia · UBS Centro", "Todos", "Igor Santos").
    scope_label: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")

    type: Mapped[str] = mapped_column(String(10), nullable=False, server_default="info")
    category: Mapped[str] = mapped_column(String(64), nullable=False, server_default="manual")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text(), nullable=False)
    body: Mapped[str | None] = mapped_column(Text(), nullable=True)
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    action_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    data: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)

    total_recipients: Mapped[int] = mapped_column(
        nullable=False, server_default=text("0"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        CheckConstraint(
            "scope_type IN ('all','municipality','facility','user')",
            name="ck_notification_broadcasts_scope",
        ),
        CheckConstraint(
            "type IN ('info','success','warning','error')",
            name="ck_notification_broadcasts_type",
        ),
    )
