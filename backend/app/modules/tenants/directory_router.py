"""Endpoints de leitura pública (para admin): municípios e unidades.

Separado do work-context para ficar claro o propósito.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.deps import DB, CurrentUserDep
from app.modules.tenants.models import Facility, Municipality
from app.modules.tenants.schemas import FacilityRead, MunicipalityRead

router = APIRouter(tags=["directory"])


@router.get("/municipalities", response_model=list[MunicipalityRead])
async def list_municipalities(db: DB, _user: CurrentUserDep) -> list[MunicipalityRead]:
    rows = (await db.scalars(select(Municipality).order_by(Municipality.name))).all()
    return [MunicipalityRead.model_validate(r) for r in rows]


@router.get("/facilities", response_model=list[FacilityRead])
async def list_facilities(
    db: DB,
    _user: CurrentUserDep,
    municipality_id: Annotated[UUID | None, Query(alias="municipalityId")] = None,
) -> list[FacilityRead]:
    stmt = select(Facility).order_by(Facility.name)
    if municipality_id is not None:
        stmt = stmt.where(Facility.municipality_id == municipality_id)
    rows = (await db.scalars(stmt)).all()
    return [FacilityRead.model_validate(r) for r in rows]
