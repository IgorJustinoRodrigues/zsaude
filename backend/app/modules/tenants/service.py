"""Serviço de tenants e work context."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.security import create_context_token
from app.db.tenant_schemas import ensure_municipality_schema, schema_for_municipality
from app.modules.tenants.models import Facility, FacilityAccess, FacilityType, Municipality, MunicipalityAccess
from app.modules.tenants.repository import TenantRepository
from app.modules.tenants.schemas import (
    FacilityCreate,
    FacilityRead,
    FacilityUpdate,
    FacilityWithAccess,
    MunicipalityCreate,
    MunicipalityDetail,
    MunicipalityRead,
    MunicipalityUpdate,
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
            municipality_ibge=mun.ibge,
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

    # ─── Admin CRUD (MASTER) ───────────────────────────────────────────

    async def _municipality_detail(self, mun: Municipality) -> MunicipalityDetail:
        fac_count = await self.session.scalar(
            select(func.count()).select_from(Facility).where(
                Facility.municipality_id == mun.id, Facility.archived.is_(False)
            )
        ) or 0
        user_count = await self.session.scalar(
            select(func.count(func.distinct(MunicipalityAccess.user_id))).where(
                MunicipalityAccess.municipality_id == mun.id
            )
        ) or 0
        return MunicipalityDetail(
            id=mun.id,
            name=mun.name,
            state=mun.state,
            ibge=mun.ibge,
            archived=mun.archived,
            schema_name=schema_for_municipality(mun.ibge),
            facility_count=int(fac_count),
            user_count=int(user_count),
        )

    async def create_municipality(self, payload: MunicipalityCreate) -> MunicipalityDetail:
        if await self.session.scalar(select(Municipality).where(Municipality.ibge == payload.ibge)):
            raise ConflictError("IBGE já cadastrado.")
        mun = Municipality(name=payload.name, state=payload.state.upper(), ibge=payload.ibge)
        self.session.add(mun)
        await self.session.flush()
        # provisiona schema mun_<ibge> no mesmo commit
        await ensure_municipality_schema(self.session, mun.ibge)
        return await self._municipality_detail(mun)

    async def update_municipality(self, municipality_id: UUID, payload: MunicipalityUpdate) -> MunicipalityDetail:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")
        if payload.name is not None:
            mun.name = payload.name
        if payload.state is not None:
            mun.state = payload.state.upper()
        await self.session.flush()
        return await self._municipality_detail(mun)

    async def archive_municipality(self, municipality_id: UUID) -> MunicipalityDetail:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")
        mun.archived = True
        # arquiva também todas as unidades do município
        await self.session.execute(
            Facility.__table__.update()
            .where(Facility.municipality_id == mun.id)
            .values(archived=True)
        )
        await self.session.flush()
        return await self._municipality_detail(mun)

    async def unarchive_municipality(self, municipality_id: UUID) -> MunicipalityDetail:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")
        mun.archived = False
        await self.session.flush()
        return await self._municipality_detail(mun)

    # ─── Facilities ────────────────────────────────────────────────────

    async def create_facility(self, payload: FacilityCreate) -> Facility:
        mun = await self.repo.get_municipality(payload.municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")
        try:
            ftype = FacilityType(payload.type)
        except ValueError:
            raise ForbiddenError(f"Tipo de unidade inválido: {payload.type}") from None
        fac = Facility(
            municipality_id=mun.id,
            name=payload.name,
            short_name=payload.short_name,
            type=ftype,
            cnes=payload.cnes,
        )
        self.session.add(fac)
        await self.session.flush()
        return fac

    async def update_facility(self, facility_id: UUID, payload: FacilityUpdate) -> Facility:
        fac = await self.session.scalar(select(Facility).where(Facility.id == facility_id))
        if fac is None:
            raise NotFoundError("Unidade não encontrada.")
        if payload.name is not None:
            fac.name = payload.name
        if payload.short_name is not None:
            fac.short_name = payload.short_name
        if payload.type is not None:
            try:
                fac.type = FacilityType(payload.type)
            except ValueError:
                raise ForbiddenError(f"Tipo de unidade inválido: {payload.type}") from None
        if payload.cnes is not None:
            fac.cnes = payload.cnes or None
        await self.session.flush()
        return fac

    async def archive_facility(self, facility_id: UUID) -> Facility:
        fac = await self.session.scalar(select(Facility).where(Facility.id == facility_id))
        if fac is None:
            raise NotFoundError("Unidade não encontrada.")
        fac.archived = True
        await self.session.flush()
        return fac

    async def unarchive_facility(self, facility_id: UUID) -> Facility:
        fac = await self.session.scalar(select(Facility).where(Facility.id == facility_id))
        if fac is None:
            raise NotFoundError("Unidade não encontrada.")
        fac.archived = False
        await self.session.flush()
        return fac

    # ─── Listas admin (inclui archived opcional) ──────────────────────

    async def list_all_municipalities(self, *, include_archived: bool = False) -> list[MunicipalityDetail]:
        stmt = select(Municipality).order_by(Municipality.name)
        if not include_archived:
            stmt = stmt.where(Municipality.archived.is_(False))
        rows = list((await self.session.scalars(stmt)).all())
        return [await self._municipality_detail(m) for m in rows]

    async def municipality_detail_by_id(self, municipality_id: UUID) -> MunicipalityDetail:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")
        return await self._municipality_detail(mun)
