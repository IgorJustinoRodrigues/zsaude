"""Modelos de auth: RefreshToken e PasswordReset."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import UUIDType, new_uuid7


class RefreshToken(Base, TimestampedMixin):
    """Refresh tokens com rotação e detecção de replay.

    - `token_hash`: SHA-256 do token opaco enviado ao cliente.
    - `family_id`: toda cadeia de rotação compartilha esse ID.
    - `replaced_by_id`: aponta para o token sucessor após rotação.
    - `revoked_at`: null enquanto válido.

    Regra: se um refresh com `replaced_by_id != NULL` for apresentado, isso
    significa que alguém está reusando — revogamos a família inteira.
    """

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_user_id_family_id", "user_id", "family_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    family_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(), nullable=True
    )
    user_agent: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    ip: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")


class PasswordReset(Base, TimestampedMixin):
    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")


class LoginAttempt(Base):
    """Tentativas de login (para rate-limit persistente + auditoria)."""

    __tablename__ = "login_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    identifier: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    ip: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    success: Mapped[bool] = mapped_column(nullable=False)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
