"""Sessão de usuário.

Uma sessão = uma família de refresh tokens = um "login". Durante a vida da
sessão, toda requisição autenticada atualiza `last_seen_at` (throttled via
Valkey). A sessão termina no logout, revogação por segurança, ou quando
um admin força o encerramento.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import UUIDType, new_uuid7


class SessionEndReason(str, enum.Enum):
    LOGOUT = "logout"
    EXPIRED = "expired"
    REVOKED_REPLAY = "revoked_replay"
    REVOKED_BY_ADMIN = "revoked_by_admin"
    USER_BLOCKED = "user_blocked"
    USER_DEACTIVATED = "user_deactivated"
    LEVEL_CHANGED = "level_changed"


class UserSession(Base, TimestampedMixin):
    __tablename__ = "user_sessions"
    __table_args__ = (
        Index("ix_user_sessions_user_started", "user_id", text("started_at DESC")),
        Index("ix_user_sessions_active", "user_id", "ended_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    family_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False, unique=True, index=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[str | None] = mapped_column(String(30), nullable=True)

    ip: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
    user_agent: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
