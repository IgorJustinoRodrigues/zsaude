"""Serviço de tenants e work context."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.security import create_context_token
from app.modules.tenants.repository import TenantRepository
from app.modules.tenants.schemas import (
    FacilityRead,
    FacilityWithAccess,
    MunicipalityRead,
    MunicipalityWithFacilities,
    WorkContextCurrent,
    WorkContextIssued,
    WorkContextOptions,
    WorkContextSelect,
)


class TenantService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = TenantRepository(session)

    async def options_for(self, user_id: UUID) -> WorkContextOptions:
        muns = await self.repo.list_municipalities_for_user(user_id)
        out: list[MunicipalityWithFacilities] = []
        for mun in muns:
            rows = await self.repo.list_facilities_for_user(user_id, mun.id)
            facilities = [
                FacilityWithAccess(
                    facility=FacilityRead.model_validate(fac),
                    role=access.role,
                    modules=list(access.modules),
                )
                for fac, access in rows
            ]
            out.append(
                MunicipalityWithFacilities(
                    municipality=MunicipalityRead.model_validate(mun),
                    facilities=facilities,
                )
            )
        return WorkContextOptions(municipalities=out)

    async def select(self, user_id: UUID, payload: WorkContextSelect) -> WorkContextIssued:
        mun = await self.repo.get_municipality(payload.municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")

        row = await self.repo.get_facility_access(user_id, payload.facility_id)
        if row is None:
            raise ForbiddenError("Você não tem acesso a esta unidade.")

        facility, access = row
        if facility.municipality_id != mun.id:
            raise ForbiddenError("Unidade não pertence ao município informado.")

        modules = list(access.modules)
        if payload.module:
            if payload.module not in modules:
                raise ForbiddenError(
                    f"Módulo {payload.module} não disponível nesta unidade para você."
                )
            modules = [payload.module]

        token = create_context_token(
            user_id=str(user_id),
            municipality_id=str(mun.id),
            facility_id=str(facility.id),
            role=access.role,
            modules=modules,
        )

        return WorkContextIssued(
            context_token=token,
            municipality=MunicipalityRead.model_validate(mun),
            facility=FacilityRead.model_validate(facility),
            role=access.role,
            modules=modules,
            expires_in=settings.work_context_ttl_minutes * 60,
        )

    async def current(
        self,
        user_id: UUID,
        municipality_id: UUID,
        facility_id: UUID,
        role: str,
        modules: list[str],
    ) -> WorkContextCurrent:
        mun = await self.repo.get_municipality(municipality_id)
        row = await self.repo.get_facility_access(user_id, facility_id)
        if mun is None or row is None:
            raise NotFoundError("Contexto não encontrado.")
        facility, _ = row
        return WorkContextCurrent(
            municipality=MunicipalityRead.model_validate(mun),
            facility=FacilityRead.model_validate(facility),
            role=role,
            modules=modules,
        )
