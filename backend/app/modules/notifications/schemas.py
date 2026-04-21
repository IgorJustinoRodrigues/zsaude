"""Schemas pydantic da central de notificações."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from app.core.schema_base import CamelModel

NotificationType = Literal["info", "success", "warning", "error"]
BroadcastScope = Literal["all", "municipality", "facility", "user"]


class NotificationRead(CamelModel):
    """Resumo listado (card, sino, inbox)."""
    id: UUID
    type: NotificationType
    category: str
    title: str
    message: str
    has_body: bool = False        # evita trafegar corpo na listagem
    has_action: bool = False
    data: dict | None = None
    read: bool
    dismissed: bool
    created_at: datetime
    read_at: datetime | None = None


class NotificationDetail(CamelModel):
    """Conteúdo completo (modal de detalhe)."""
    id: UUID
    type: NotificationType
    category: str
    title: str
    message: str
    body: str | None = None
    action_url: str | None = None
    action_label: str | None = None
    data: dict | None = None
    read: bool
    dismissed: bool
    created_at: datetime
    read_at: datetime | None = None
    created_by_name: str | None = None
    scope_label: str | None = None


class UnreadCountResponse(CamelModel):
    count: int


class MessageResponse(CamelModel):
    message: str


# ─── Broadcast (admin compose) ───────────────────────────────────────────


class BroadcastCreate(CamelModel):
    """Body do POST ``/admin/notifications/broadcast``."""
    scope_type: BroadcastScope
    scope_id: UUID | None = None     # None quando scope='all'
    type: NotificationType = "info"
    category: str = Field(default="manual", max_length=64)
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    body: str | None = Field(default=None, max_length=50_000)
    action_url: str | None = Field(default=None, max_length=500)
    action_label: str | None = Field(default=None, max_length=100)


class BroadcastRead(CamelModel):
    id: UUID
    scope_type: BroadcastScope
    scope_id: UUID | None
    scope_label: str
    type: NotificationType
    category: str
    title: str
    message: str
    total_recipients: int
    read_count: int = 0
    created_at: datetime
    created_by_name: str | None = None


class BroadcastDetail(BroadcastRead):
    body: str | None = None
    action_url: str | None = None
    action_label: str | None = None
    # Lista resumida dos destinatários (até N primeiros)
    recipients: list["BroadcastRecipient"] = []


class BroadcastRecipient(CamelModel):
    user_id: UUID
    user_name: str
    read_at: datetime | None = None
