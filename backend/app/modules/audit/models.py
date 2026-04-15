"""Modelo AuditLog.

Particionamento mensal e consumer do stream virão na Fase 4. Por ora, writes
vão direto na tabela.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import new_uuid7


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_at_desc", text("at DESC")),
        Index("ix_audit_logs_user_at", "user_id", text("at DESC")),
        Index("ix_audit_logs_module_action", "module", "action"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)

    user_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    user_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    municipality_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    facility_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    role: Mapped[str] = mapped_column(String(100), nullable=False, server_default="")

    module: Mapped[str] = mapped_column(String(10), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, server_default="info")

    resource: Mapped[str] = mapped_column(String(60), nullable=False, server_default="")
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")

    description: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    ip: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
    user_agent: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")

    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
