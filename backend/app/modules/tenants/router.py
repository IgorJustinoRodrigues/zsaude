"""Endpoints de work context e leitura de municípios/unidades."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import DB, CurrentContextDep, CurrentUserDep
from app.modules.tenants.schemas import (
    WorkContextCurrent,
    WorkContextIssued,
    WorkContextOptions,
    WorkContextSelect,
)
from app.modules.tenants.service import TenantService

router = APIRouter(prefix="/work-context", tags=["work-context"])


@router.get("/options", response_model=WorkContextOptions)
async def options(db: DB, user: CurrentUserDep) -> WorkContextOptions:
    return await TenantService(db).options_for(user.id)


@router.post("/select", response_model=WorkContextIssued)
async def select(payload: WorkContextSelect, db: DB, user: CurrentUserDep) -> WorkContextIssued:
    return await TenantService(db).select(user.id, payload)


@router.get("/current", response_model=WorkContextCurrent)
async def current(db: DB, ctx: CurrentContextDep) -> WorkContextCurrent:
    return await TenantService(db).current(
        user_id=ctx.user_id,
        municipality_id=ctx.municipality_id,
        facility_id=ctx.facility_id,
        role=ctx.role,
        modules=ctx.modules,
    )
