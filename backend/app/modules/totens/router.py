"""Endpoints dos totens lógicos."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.deps import DB, CurrentContextDep, CurrentUserDep, MasterDep
from app.modules.totens.schemas import (
    AvailableTotem,
    TotemCreate,
    TotemRead,
    TotemUpdate,
)
from app.modules.totens.service import TotemService

admin_router = APIRouter(prefix="/admin/totens", tags=["totens-admin"])
router = APIRouter(prefix="/totens", tags=["totens"])


@admin_router.get(
    "/municipalities/{municipality_id}/totens",
    response_model=list[TotemRead],
)
async def list_municipality_totens(
    municipality_id: UUID, db: DB, _: MasterDep,
) -> list[TotemRead]:
    return await TotemService(db).list_scope(
        "municipality", municipality_id, include_archived=True,
    )


@admin_router.post(
    "/municipalities/{municipality_id}/totens",
    response_model=TotemRead, status_code=201,
)
async def create_municipality_totem(
    municipality_id: UUID, payload: TotemCreate, db: DB, _: MasterDep,
) -> TotemRead:
    return await TotemService(db).create("municipality", municipality_id, payload)


@admin_router.get(
    "/facilities/{facility_id}/totens",
    response_model=list[TotemRead],
)
async def list_facility_totens(
    facility_id: UUID, db: DB, _: MasterDep,
) -> list[TotemRead]:
    return await TotemService(db).list_scope(
        "facility", facility_id, include_archived=True,
    )


@admin_router.post(
    "/facilities/{facility_id}/totens",
    response_model=TotemRead, status_code=201,
)
async def create_facility_totem(
    facility_id: UUID, payload: TotemCreate, db: DB, _: MasterDep,
) -> TotemRead:
    return await TotemService(db).create("facility", facility_id, payload)


@admin_router.patch("/{totem_id}", response_model=TotemRead)
async def update_totem(
    totem_id: UUID, payload: TotemUpdate, db: DB, _: MasterDep,
) -> TotemRead:
    return await TotemService(db).update(totem_id, payload)


@admin_router.delete("/{totem_id}", status_code=204)
async def delete_totem(totem_id: UUID, db: DB, _: MasterDep) -> Response:
    await TotemService(db).delete(totem_id)
    return Response(status_code=204)


@router.get("/available", response_model=list[AvailableTotem])
async def available_totens(
    db: DB, _user: CurrentUserDep, ctx: CurrentContextDep,
) -> list[AvailableTotem]:
    return await TotemService(db).available_for_facility(ctx.facility_id)
