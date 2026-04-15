"""Endpoints de work context e leitura de municípios/unidades."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.deps import DB, CurrentContextDep, CurrentUserDep
from app.modules.tenants.models import Facility, Municipality
from app.modules.tenants.schemas import (
    FacilityRead,
    MunicipalityRead,
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
        permissions=ctx.permissions.to_list(),
    )
