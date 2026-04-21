"""Endpoints de setores.

Admin (MASTER — catálogo do município e templates):
- ``GET/POST       /admin/sectors/municipalities/{id}/sectors``
- ``GET/POST       /admin/sectors/facilities/{id}/sectors``
- ``PATCH/DELETE   /admin/sectors/{sector_id}``
- ``POST           /admin/sectors/reorder`` — reordena uma lista scoped
- ``POST           /admin/sectors/facilities/{id}/customize``   (clona município)
- ``POST           /admin/sectors/facilities/{id}/uncustomize`` (volta a herdar)

Runtime (qualquer user autenticado):
- ``GET /sectors/effective`` — setores efetivos do work-context atual.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.deps import DB, CurrentContextDep, CurrentUserDep, MasterDep
from app.modules.sectors.schemas import (
    EffectiveSectorsOutput,
    SectorCreate,
    SectorRead,
    SectorReorder,
    SectorUpdate,
)
from app.modules.sectors.service import SectorService

admin_router = APIRouter(prefix="/admin/sectors", tags=["sectors-admin"])
router = APIRouter(prefix="/sectors", tags=["sectors"])


# ─── Admin: catálogo do município ────────────────────────────────────────────

@admin_router.get(
    "/municipalities/{municipality_id}/sectors",
    response_model=list[SectorRead],
)
async def list_municipality_sectors(
    municipality_id: UUID, db: DB, _: MasterDep,
) -> list[SectorRead]:
    return await SectorService(db).list_scope(
        "municipality", municipality_id, include_archived=True,
    )


@admin_router.post(
    "/municipalities/{municipality_id}/sectors",
    response_model=SectorRead,
    status_code=201,
)
async def create_municipality_sector(
    municipality_id: UUID, payload: SectorCreate, db: DB, _: MasterDep,
) -> SectorRead:
    return await SectorService(db).create("municipality", municipality_id, payload)


# ─── Admin: catálogo da unidade ──────────────────────────────────────────────

@admin_router.get(
    "/facilities/{facility_id}/sectors",
    response_model=list[SectorRead],
)
async def list_facility_sectors(
    facility_id: UUID, db: DB, _: MasterDep,
) -> list[SectorRead]:
    return await SectorService(db).list_scope(
        "facility", facility_id, include_archived=True,
    )


@admin_router.post(
    "/facilities/{facility_id}/sectors",
    response_model=SectorRead,
    status_code=201,
)
async def create_facility_sector(
    facility_id: UUID, payload: SectorCreate, db: DB, _: MasterDep,
) -> SectorRead:
    return await SectorService(db).create("facility", facility_id, payload)


@admin_router.post(
    "/facilities/{facility_id}/customize",
    response_model=EffectiveSectorsOutput,
)
async def customize_facility_sectors(
    facility_id: UUID, db: DB, _: MasterDep,
) -> EffectiveSectorsOutput:
    """Clona os setores do município pra unidade e marca como custom."""
    return await SectorService(db).start_customize_facility(facility_id)


@admin_router.post(
    "/facilities/{facility_id}/uncustomize",
    response_model=EffectiveSectorsOutput,
)
async def uncustomize_facility_sectors(
    facility_id: UUID, db: DB, _: MasterDep,
) -> EffectiveSectorsOutput:
    """Volta a herdar o município (apaga as rows scope=facility)."""
    return await SectorService(db).stop_customize_facility(facility_id)


# ─── Admin: por setor individual ─────────────────────────────────────────────

@admin_router.patch("/{sector_id}", response_model=SectorRead)
async def update_sector(
    sector_id: UUID, payload: SectorUpdate, db: DB, _: MasterDep,
) -> SectorRead:
    return await SectorService(db).update(sector_id, payload)


@admin_router.delete("/{sector_id}", status_code=204)
async def delete_sector(sector_id: UUID, db: DB, _: MasterDep) -> Response:
    await SectorService(db).delete(sector_id)
    return Response(status_code=204)


# ─── Admin: reordenar ────────────────────────────────────────────────────────

@admin_router.post(
    "/municipalities/{municipality_id}/sectors/reorder",
    response_model=list[SectorRead],
)
async def reorder_municipality_sectors(
    municipality_id: UUID, payload: SectorReorder, db: DB, _: MasterDep,
) -> list[SectorRead]:
    return await SectorService(db).reorder("municipality", municipality_id, payload)


@admin_router.post(
    "/facilities/{facility_id}/sectors/reorder",
    response_model=list[SectorRead],
)
async def reorder_facility_sectors(
    facility_id: UUID, payload: SectorReorder, db: DB, _: MasterDep,
) -> list[SectorRead]:
    return await SectorService(db).reorder("facility", facility_id, payload)


# ─── Runtime ─────────────────────────────────────────────────────────────────

@router.get("/effective", response_model=EffectiveSectorsOutput)
async def effective_sectors(
    db: DB, _user: CurrentUserDep, ctx: CurrentContextDep,
) -> EffectiveSectorsOutput:
    return await SectorService(db).effective_for_facility(ctx.facility_id)
