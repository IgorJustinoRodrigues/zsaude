"""Tabela chave-valor com configurações globais do sistema."""

from __future__ import annotations

import uuid

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import JSONType, UUIDType, new_uuid7


class SystemSetting(Base, TimestampedMixin):
    __tablename__ = "system_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    value: Mapped[dict] = mapped_column(JSONType(), nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False, server_default=" ")
