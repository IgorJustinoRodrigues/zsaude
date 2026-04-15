"""Repositório de tenants."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.models import (
    Facility,
    FacilityAccess,
    Municipality,
    MunicipalityAccess,
)


class TenantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Municípios ─────────────────────────────────────────────────────

    async def list_municipalities_for_user(self, user_id: UUID) -> list[Municipality]:
        stmt = (
            select(Municipality)
            .join(MunicipalityAccess, MunicipalityAccess.municipality_id == Municipality.id)
            .where(MunicipalityAccess.user_id == user_id)
            .order_by(Municipality.name)
        )
        return list((await self.session.scalars(stmt)).all())

    async def get_municipality(self, municipality_id: UUID) -> Municipality | None:
        return await self.session.scalar(select(Municipality).where(Municipality.id == municipality_id))

    # ── Unidades ───────────────────────────────────────────────────────

    async def list_facilities_for_user(
        self, user_id: UUID, municipality_id: UUID | None = None
    ) -> list[tuple[Facility, FacilityAccess]]:
        stmt = (
            select(Facility, FacilityAccess)
            .join(FacilityAccess, FacilityAccess.facility_id == Facility.id)
            .where(FacilityAccess.user_id == user_id)
            .order_by(Facility.name)
        )
        if municipality_id:
            stmt = stmt.where(Facility.municipality_id == municipality_id)
        return list((await self.session.execute(stmt)).all())

    async def get_facility_access(
        self, user_id: UUID, facility_id: UUID
    ) -> tuple[Facility, FacilityAccess] | None:
        stmt = (
            select(Facility, FacilityAccess)
            .join(FacilityAccess, FacilityAccess.facility_id == Facility.id)
            .where(FacilityAccess.user_id == user_id, Facility.id == facility_id)
        )
        row = (await self.session.execute(stmt)).first()
        if row is None:
            return None
        return row[0], row[1]
