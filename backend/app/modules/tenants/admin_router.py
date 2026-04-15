"""Endpoints admin MASTER: CRUD de município + unidade."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.core.deps import DB, MasterDep
from app.modules.tenants.schemas import (
    FacilityCreate,
    FacilityRead,
    FacilityUpdate,
    MessageResponse,
    MunicipalityCreate,
    MunicipalityDetail,
    MunicipalityUpdate,
)
from app.modules.tenants.service import TenantService

router = APIRouter(tags=["admin-tenants"])


# ─── Municípios ───────────────────────────────────────────────────────────────


@router.get("/admin/municipalities", response_model=list[MunicipalityDetail])
async def list_municipalities_admin(
    db: DB,
    _: MasterDep,
    include_archived: Annotated[bool, Query(alias="includeArchived")] = False,
) -> list[MunicipalityDetail]:
    return await TenantService(db).list_all_municipalities(include_archived=include_archived)


@router.get("/admin/municipalities/{municipality_id}", response_model=MunicipalityDetail)
async def get_municipality_admin(municipality_id: UUID, db: DB, _: MasterDep) -> MunicipalityDetail:
    return await TenantService(db).municipality_detail_by_id(municipality_id)


@router.post("/admin/municipalities", response_model=MunicipalityDetail, status_code=status.HTTP_201_CREATED)
async def create_municipality(payload: MunicipalityCreate, db: DB, _: MasterDep) -> MunicipalityDetail:
    return await TenantService(db).create_municipality(payload)


@router.patch("/admin/municipalities/{municipality_id}", response_model=MunicipalityDetail)
async def update_municipality(
    municipality_id: UUID, payload: MunicipalityUpdate, db: DB, _: MasterDep
) -> MunicipalityDetail:
    return await TenantService(db).update_municipality(municipality_id, payload)


@router.post("/admin/municipalities/{municipality_id}/archive", response_model=MunicipalityDetail)
async def archive_municipality(municipality_id: UUID, db: DB, _: MasterDep) -> MunicipalityDetail:
    return await TenantService(db).archive_municipality(municipality_id)


@router.post("/admin/municipalities/{municipality_id}/unarchive", response_model=MunicipalityDetail)
async def unarchive_municipality(municipality_id: UUID, db: DB, _: MasterDep) -> MunicipalityDetail:
    return await TenantService(db).unarchive_municipality(municipality_id)


# ─── Unidades ────────────────────────────────────────────────────────────────


@router.post("/admin/facilities", response_model=FacilityRead, status_code=status.HTTP_201_CREATED)
async def create_facility(payload: FacilityCreate, db: DB, _: MasterDep) -> FacilityRead:
    fac = await TenantService(db).create_facility(payload)
    return FacilityRead.model_validate(fac)


@router.patch("/admin/facilities/{facility_id}", response_model=FacilityRead)
async def update_facility(facility_id: UUID, payload: FacilityUpdate, db: DB, _: MasterDep) -> FacilityRead:
    fac = await TenantService(db).update_facility(facility_id, payload)
    return FacilityRead.model_validate(fac)


@router.post("/admin/facilities/{facility_id}/archive", response_model=MessageResponse)
async def archive_facility(facility_id: UUID, db: DB, _: MasterDep) -> MessageResponse:
    await TenantService(db).archive_facility(facility_id)
    return MessageResponse(message="Unidade arquivada.")


@router.post("/admin/facilities/{facility_id}/unarchive", response_model=MessageResponse)
async def unarchive_facility(facility_id: UUID, db: DB, _: MasterDep) -> MessageResponse:
    await TenantService(db).unarchive_facility(facility_id)
    return MessageResponse(message="Unidade reativada.")
