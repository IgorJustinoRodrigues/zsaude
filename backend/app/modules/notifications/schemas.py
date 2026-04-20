"""Schemas pydantic da central de notificações."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from app.core.schema_base import CamelModel

NotificationType = Literal["info", "success", "warning", "error"]


class NotificationRead(CamelModel):
    id: UUID
    type: NotificationType
    category: str
    title: str
    message: str
    data: dict | None = None
    read: bool
    dismissed: bool
    created_at: datetime
    read_at: datetime | None = None


class UnreadCountResponse(CamelModel):
    count: int


class MessageResponse(CamelModel):
    message: str
