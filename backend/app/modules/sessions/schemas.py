"""Schemas de sessão."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.core.schema_base import CamelModel


class SessionRead(CamelModel):
    id: UUID
    user_id: UUID
    user_name: str | None = None
    started_at: datetime
    last_seen_at: datetime
    ended_at: datetime | None = None
    end_reason: str | None = None
    ip: str
    user_agent: str
    is_active: bool
    is_online: bool
    duration_seconds: int


class PresenceItem(CamelModel):
    user_id: UUID
    user_name: str
    email: str
    primary_role: str
    session_id: UUID
    started_at: datetime
    last_seen_at: datetime
    ip: str


class MessageResponse(CamelModel):
    message: str
