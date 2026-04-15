"""Schemas de audit log."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from app.core.schema_base import CamelModel


class AuditLogRead(CamelModel):
    id: UUID
    user_id: UUID | None = None
    user_name: str
    municipality_id: UUID | None = None
    facility_id: UUID | None = None
    role: str
    module: str
    action: str
    severity: str
    resource: str
    resource_id: str
    description: str
    details: dict[str, Any]
    ip: str
    user_agent: str
    request_id: str
    at: datetime
