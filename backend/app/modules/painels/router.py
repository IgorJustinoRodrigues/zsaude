"""Endpoints dos painéis lógicos."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.deps import DB, CurrentContextDep, CurrentUserDep, MasterDep
from app.modules.painels.schemas import (
    AvailablePainel,
    PainelCreate,
    PainelRead,
    PainelUpdate,
)
from app.modules.painels.service import PainelService

admin_router = APIRouter(prefix="/admin/painels", tags=["painels-admin"])
router = APIRouter(prefix="/painels", tags=["painels"])


# ─── Admin ──────────────────────────────────────────────────────────────────

@admin_router.get(
    "/municipalities/{municipality_id}/painels",
    response_model=list[PainelRead],
)
async def list_municipality_painels(
    municipality_id: UUID, db: DB, _: MasterDep,
) -> list[PainelRead]:
    return await PainelService(db).list_scope(
        "municipality", municipality_id, include_archived=True,
    )


@admin_router.post(
    "/municipalities/{municipality_id}/painels",
    response_model=PainelRead, status_code=201,
)
async def create_municipality_painel(
    municipality_id: UUID, payload: PainelCreate, db: DB, _: MasterDep,
) -> PainelRead:
    return await PainelService(db).create("municipality", municipality_id, payload)


@admin_router.get(
    "/facilities/{facility_id}/painels",
    response_model=list[PainelRead],
)
async def list_facility_painels(
    facility_id: UUID, db: DB, _: MasterDep,
) -> list[PainelRead]:
    return await PainelService(db).list_scope(
        "facility", facility_id, include_archived=True,
    )


@admin_router.post(
    "/facilities/{facility_id}/painels",
    response_model=PainelRead, status_code=201,
)
async def create_facility_painel(
    facility_id: UUID, payload: PainelCreate, db: DB, _: MasterDep,
) -> PainelRead:
    return await PainelService(db).create("facility", facility_id, payload)


@admin_router.patch("/{painel_id}", response_model=PainelRead)
async def update_painel(
    painel_id: UUID, payload: PainelUpdate, db: DB, _: MasterDep,
) -> PainelRead:
    return await PainelService(db).update(painel_id, payload)


@admin_router.delete("/{painel_id}", status_code=204)
async def delete_painel(painel_id: UUID, db: DB, _: MasterDep) -> Response:
    await PainelService(db).delete(painel_id)
    return Response(status_code=204)


# ─── Runtime ────────────────────────────────────────────────────────────────

@router.get("/available", response_model=list[AvailablePainel])
async def available_painels(
    db: DB, _user: CurrentUserDep, ctx: CurrentContextDep,
) -> list[AvailablePainel]:
    """Painéis disponíveis pra unidade atual (próprios + herdados do
    município). Consumido pelo modal de pareamento."""
    return await PainelService(db).available_for_facility(ctx.facility_id)
