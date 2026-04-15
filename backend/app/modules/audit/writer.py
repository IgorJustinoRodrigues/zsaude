"""Escritor de audit logs.

Ponto único de gravação. Lê o `AuditContext` (contextvars) para herdar
IP, user-agent, request-id, user, facility e role automaticamente.

Pode ser usado em dois modos:
- via middleware (automático, todas as mutações HTTP)
- via chamada explícita (para eventos específicos como login/logout/replay)
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import get_audit_context
from app.modules.audit.models import AuditLog


async def write_audit(
    session: AsyncSession,
    *,
    module: str,
    action: str,
    severity: str = "info",
    resource: str = "",
    resource_id: str = "",
    description: str = "",
    details: dict[str, Any] | None = None,
    # Overrides — se não vierem, usa o AuditContext do request atual
    user_id: uuid.UUID | None = None,
    user_name: str = "",
    municipality_id: uuid.UUID | None = None,
    facility_id: uuid.UUID | None = None,
    role: str = "",
    ip: str = "",
    user_agent: str = "",
    request_id: str = "",
) -> AuditLog:
    ctx = get_audit_context()
    log = AuditLog(
        user_id=user_id or ctx.user_id,
        user_name=user_name or ctx.user_name,
        municipality_id=municipality_id or ctx.municipality_id,
        facility_id=facility_id or ctx.facility_id,
        role=role or ctx.role or "",
        module=module,
        action=action,
        severity=severity,
        resource=resource,
        resource_id=resource_id,
        description=description,
        details=details or {},
        ip=ip or (ctx.ip or ""),
        user_agent=user_agent or (ctx.user_agent or ""),
        request_id=request_id or ctx.request_id or "",
    )
    session.add(log)
    await session.flush()
    return log
