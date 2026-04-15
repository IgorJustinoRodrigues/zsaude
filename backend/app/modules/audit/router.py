"""Endpoint de consulta de audit logs (MASTER)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import desc, func, or_, select

from app.core.deps import DB, MasterDep
from app.core.pagination import Page
from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditLogRead

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=Page[AuditLogRead])
async def list_logs(
    db: DB,
    _: MasterDep,
    search: Annotated[str | None, Query()] = None,
    module: Annotated[str | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
    severity: Annotated[str | None, Query()] = None,
    scope: Annotated[str | None, Query()] = None,  # 'master' = só module='SYS'
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, alias="pageSize")] = 20,
) -> Page[AuditLogRead]:
    stmt = select(AuditLog)

    if search:
        q = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(AuditLog.user_name).like(q),
                func.lower(AuditLog.description).like(q),
                AuditLog.ip.like(f"%{search}%"),
            )
        )
    if module:
        stmt = stmt.where(AuditLog.module == module)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if severity:
        stmt = stmt.where(AuditLog.severity == severity)
    if scope == "master":
        stmt = stmt.where(AuditLog.module == "SYS")

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await db.scalar(count_stmt)) or 0)

    stmt = stmt.order_by(desc(AuditLog.at)).offset((page - 1) * page_size).limit(page_size)
    rows = list((await db.scalars(stmt)).all())
    items = [AuditLogRead.model_validate(r) for r in rows]
    return Page[AuditLogRead](items=items, total=total, page=page, page_size=page_size)
