"""Modelo de dispositivos pareados."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import UUIDType, new_uuid7


class Device(Base, TimestampedMixin):
    """Totem ou painel de chamadas pareado a uma unidade.

    Três estados implícitos:
    - **Pending**: ``pairing_code`` preenchido, aguardando consumo.
    - **Paired**: ``token_hash`` preenchido, ``facility_id`` setado.
    - **Revoked**: ``revoked_at`` preenchido, ``token_hash`` NULL.
    """

    __tablename__ = "devices"
    __table_args__ = (
        CheckConstraint(
            "type IN ('totem', 'painel')",
            name="ck_devices_type_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    facility_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("facilities.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Pareamento — cleared após o device_token ser emitido.
    pairing_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    pairing_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # Paired
    paired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paired_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Token que o device apresenta a cada request autenticado.
    # Hash SHA-256 — o device tem a versão plain, o banco só o hash.
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Presença — atualizada por WS ou ping.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Revogação
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    @property
    def status(self) -> str:
        """Status derivado (não persistido). Pra exibição/testes."""
        if self.revoked_at is not None:
            return "revoked"
        if self.token_hash is not None:
            return "paired"
        if self.pairing_code is not None:
            return "pending"
        return "stale"  # estado inválido — sem code e sem token
