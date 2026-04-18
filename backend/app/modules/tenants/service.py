"""Serviço de tenants e work context."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.modules import OPERATIONAL_MODULES
from app.core.security import create_context_token
from app.db.tenant_schemas import ensure_municipality_schema, schema_for_municipality
from app.modules.tenants.models import (
    Facility,
    FacilityAccess,
    FacilityType,
    Municipality,
    MunicipalityAccess,
    Neighborhood,
)
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
    NeighborhoodInput,
    NeighborhoodOut,
    WorkContextCurrent,
    WorkContextIssued,
    WorkContextOptions,
    WorkContextSelect,
)


class TenantService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = TenantRepository(session)

    # ── Helpers internos ──────────────────────────────────────────────

    @staticmethod
    def _enabled_modules_set(mun: Municipality) -> frozenset[str]:
        """Conjunto de módulos habilitados, com default "todos" para
        municípios legados sem configuração."""
        if not mun.enabled_modules:
            return OPERATIONAL_MODULES
        return frozenset(m for m in mun.enabled_modules if m in OPERATIONAL_MODULES)

    async def _is_master(self, user_id: UUID) -> bool:
        from app.modules.users.models import User, UserLevel
        level = await self.session.scalar(select(User.level).where(User.id == user_id))
        return level == UserLevel.MASTER

    async def options_for(self, user_id: UUID) -> WorkContextOptions:
        from app.modules.permissions.models import Role
        from app.modules.permissions.service import PermissionService

        perm_svc = PermissionService(self.session)

        is_master = await self._is_master(user_id)

        if is_master:
            # MASTER enxerga todos os municípios + todas as unidades,
            # independentemente de MunicipalityAccess/FacilityAccess.
            muns = list((await self.session.scalars(
                select(Municipality)
                .where(Municipality.archived== False)
                .order_by(Municipality.name)
            )).all())
        else:
            muns = await self.repo.list_municipalities_for_user(user_id)
        out: list[MunicipalityWithFacilities] = []

        # Cache roles por id (options costuma ter vários acessos ao mesmo role).
        role_cache: dict[UUID, Role] = {}

        async def role_name(role_id: UUID) -> str:
            if role_id not in role_cache:
                r = await self.session.get(Role, role_id)
                if r is not None:
                    role_cache[role_id] = r
            r = role_cache.get(role_id)
            return r.name if r else ""

        for mun in muns:
            enabled = self._enabled_modules_set(mun)
            facilities: list[FacilityWithAccess] = []

            if is_master:
                # MASTER vê todas as unidades do município. Role sintético.
                fac_rows = list((await self.session.scalars(
                    select(Facility)
                    .where(Facility.municipality_id == mun.id, Facility.archived== False)
                    .order_by(Facility.name)
                )).all())
                for fac in fac_rows:
                    mods = sorted(OPERATIONAL_MODULES & enabled)
                    facilities.append(
                        FacilityWithAccess(
                            facility=FacilityRead.model_validate(fac),
                            role="MASTER",
                            modules=mods,
                        )
                    )
            else:
                rows = await self.repo.list_facilities_for_user(user_id, mun.id)
                for fac, access in rows:
                    resolved = await perm_svc.resolve(user_id, access.id)
                    available = OPERATIONAL_MODULES if resolved.is_root else resolved.modules() & OPERATIONAL_MODULES
                    mods = sorted(available & enabled)
                    facilities.append(
                        FacilityWithAccess(
                            facility=FacilityRead.model_validate(fac),
                            role=await role_name(access.role_id),
                            modules=mods,
                        )
                    )

            out.append(
                MunicipalityWithFacilities(
                    municipality=MunicipalityRead.model_validate(mun),
                    facilities=facilities,
                )
            )
        return WorkContextOptions(municipalities=out)

    async def select(self, user_id: UUID, payload: WorkContextSelect) -> WorkContextIssued:
        from app.modules.permissions.service import PermissionService, ResolvedPermissions

        mun = await self.repo.get_municipality(payload.municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")

        is_master = await self._is_master(user_id)

        if is_master:
            facility = await self.session.scalar(
                select(Facility).where(Facility.id == payload.facility_id)
            )
            if facility is None:
                raise NotFoundError("Unidade não encontrada.")
            if facility.municipality_id != mun.id:
                raise ForbiddenError("Unidade não pertence ao município informado.")
            # MASTER: permissões root, role sintético.
            resolved = ResolvedPermissions(codes=frozenset(), is_root=True)
            role_name = "MASTER"
        else:
            row = await self.repo.get_facility_access(user_id, payload.facility_id)
            if row is None:
                raise ForbiddenError("Você não tem acesso a esta unidade.")
            facility, access = row
            if facility.municipality_id != mun.id:
                raise ForbiddenError("Unidade não pertence ao município informado.")
            resolved = await PermissionService(self.session).resolve(user_id, access.id)
            from app.modules.permissions.models import Role
            role = await self.session.get(Role, access.role_id)
            role_name = role.name if role else ""

        enabled = self._enabled_modules_set(mun)
        if resolved.is_root:
            modules = sorted(OPERATIONAL_MODULES & enabled)
        else:
            modules = sorted(resolved.modules() & OPERATIONAL_MODULES & enabled)

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
            role=role_name,
            modules=modules,
        )

        # Audit com nomes (não só IDs) — assim os logs ficam legíveis sem
        # precisar resolver UUIDs posteriormente.
        from app.core.audit import get_audit_context
        from app.modules.audit.helpers import describe_change
        from app.modules.audit.writer import write_audit

        fac_type = facility.type.value if hasattr(facility.type, "value") else str(facility.type)
        actor = get_audit_context().user_name
        extra = f"{mun.name}/{mun.state}" + (f" · módulo {payload.module.upper()}" if payload.module else "")
        await write_audit(
            self.session,
            module="auth",
            action="select_context",
            severity="info",
            resource="WorkContext",
            resource_id=str(facility.id),
            description=describe_change(
                actor=actor, verb="entrou em",
                target_kind="unidade",
                target_name=f"{facility.name} ({fac_type})",
                extra=extra,
            ),
            user_id=user_id,
            municipality_id=mun.id,
            facility_id=facility.id,
            role=role_name,
            details={
                "municipalityId": str(mun.id),
                "municipalityName": mun.name,
                "municipalityState": mun.state,
                "municipalityIbge": mun.ibge,
                "facilityId": str(facility.id),
                "facilityName": facility.name,
                "facilityShortName": facility.short_name,
                "facilityType": fac_type,
                "role": role_name,
                "modules": modules,
                "selectedModule": payload.module,
            },
        )

        return WorkContextIssued(
            context_token=token,
            municipality=MunicipalityRead.model_validate(mun),
            facility=FacilityRead.model_validate(facility),
            role=role_name,
            modules=modules,
            permissions=resolved.to_list(),
            expires_in=settings.work_context_ttl_minutes * 60,
        )

    async def current(
        self,
        user_id: UUID,
        municipality_id: UUID,
        facility_id: UUID,
        role: str,
        modules: list[str],
        permissions: list[str],
    ) -> WorkContextCurrent:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Contexto não encontrado.")

        if await self._is_master(user_id):
            facility = await self.session.scalar(
                select(Facility).where(Facility.id == facility_id)
            )
        else:
            row = await self.repo.get_facility_access(user_id, facility_id)
            facility = row[0] if row else None
        if facility is None:
            raise NotFoundError("Contexto não encontrado.")

        return WorkContextCurrent(
            municipality=MunicipalityRead.model_validate(mun),
            facility=FacilityRead.model_validate(facility),
            role=role,
            modules=modules,
            permissions=permissions,
        )

    # ─── Admin CRUD (MASTER) ───────────────────────────────────────────

    async def _municipality_detail(self, mun: Municipality) -> MunicipalityDetail:
        fac_count = await self.session.scalar(
            select(func.count()).select_from(Facility).where(
                Facility.municipality_id == mun.id, Facility.archived== False
            )
        ) or 0
        user_count = await self.session.scalar(
            select(func.count(func.distinct(MunicipalityAccess.user_id))).where(
                MunicipalityAccess.municipality_id == mun.id
            )
        ) or 0
        hoods = list((await self.session.scalars(
            select(Neighborhood)
            .where(Neighborhood.municipality_id == mun.id)
            .order_by(Neighborhood.name)
        )).all())
        return MunicipalityDetail(
            id=mun.id,
            name=mun.name,
            state=mun.state,
            ibge=mun.ibge,
            archived=mun.archived,
            schema_name=schema_for_municipality(mun.ibge),
            facility_count=int(fac_count),
            user_count=int(user_count),
            population=mun.population,
            center_latitude=float(mun.center_latitude) if mun.center_latitude is not None else None,
            center_longitude=float(mun.center_longitude) if mun.center_longitude is not None else None,
            territory=mun.territory,
            enabled_modules=sorted(self._enabled_modules_set(mun)),
            cadsus_user=mun.cadsus_user or "",
            cadsus_password_set=bool(mun.cadsus_password),
            neighborhoods=[
                NeighborhoodOut(
                    id=n.id,
                    name=n.name,
                    population=n.population,
                    latitude=float(n.latitude) if n.latitude is not None else None,
                    longitude=float(n.longitude) if n.longitude is not None else None,
                    territory=n.territory,
                )
                for n in hoods
            ],
        )

    async def create_municipality(self, payload: MunicipalityCreate) -> MunicipalityDetail:
        if await self.session.scalar(select(Municipality).where(Municipality.ibge == payload.ibge)):
            raise ConflictError("IBGE já cadastrado.")
        requested = payload.enabled_modules
        enabled = (
            sorted(set(requested) & OPERATIONAL_MODULES)
            if requested is not None
            else sorted(OPERATIONAL_MODULES)
        )
        mun = Municipality(
            name=payload.name,
            state=payload.state.upper(),
            ibge=payload.ibge,
            population=payload.population,
            center_latitude=payload.center_latitude,
            center_longitude=payload.center_longitude,
            territory=payload.territory,
            enabled_modules=enabled,
        )
        self.session.add(mun)
        await self.session.flush()
        # provisiona schema mun_<ibge> no mesmo commit
        await ensure_municipality_schema(self.session, mun.ibge)

        # Cria a SMS default — toda cidade tem Secretaria Municipal de Saúde.
        # Evita o ciclo "cadastrei município mas não consigo importar CNES
        # porque ainda não tem nenhuma unidade". MASTER pode arquivar depois.
        self.session.add(Facility(
            municipality_id=mun.id,
            name=f"Secretaria Municipal de Saúde — {mun.name}",
            short_name="SMS",
            type=FacilityType.SMS,
            cnes=None,
        ))

        # bairros iniciais
        if payload.neighborhoods:
            await self._replace_neighborhoods(mun.id, payload.neighborhoods)

        await self.session.flush()
        return await self._municipality_detail(mun)

    async def update_municipality(self, municipality_id: UUID, payload: MunicipalityUpdate) -> MunicipalityDetail:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")

        changes: dict[str, dict] = {}
        fields = payload.model_fields_set

        if payload.name is not None and payload.name != mun.name:
            changes["name"] = {"from": mun.name, "to": payload.name}
            mun.name = payload.name
        if payload.state is not None:
            new_state = payload.state.upper()
            if new_state != mun.state:
                changes["state"] = {"from": mun.state, "to": new_state}
                mun.state = new_state
        if "population" in fields and payload.population != mun.population:
            changes["population"] = {"from": mun.population, "to": payload.population}
            mun.population = payload.population
        if "center_latitude" in fields and payload.center_latitude != (float(mun.center_latitude) if mun.center_latitude is not None else None):
            changes["centerLatitude"] = {"from": float(mun.center_latitude) if mun.center_latitude is not None else None, "to": payload.center_latitude}
            mun.center_latitude = payload.center_latitude
        if "center_longitude" in fields and payload.center_longitude != (float(mun.center_longitude) if mun.center_longitude is not None else None):
            changes["centerLongitude"] = {"from": float(mun.center_longitude) if mun.center_longitude is not None else None, "to": payload.center_longitude}
            mun.center_longitude = payload.center_longitude
        if "territory" in fields and payload.territory != mun.territory:
            changes["territory"] = {"from": "desenhado" if mun.territory else None, "to": "desenhado" if payload.territory else None}
            mun.territory = payload.territory
        if "enabled_modules" in fields:
            new_mods = sorted(set(payload.enabled_modules or []) & OPERATIONAL_MODULES)
            current_mods = sorted(self._enabled_modules_set(mun))
            if new_mods != current_mods:
                changes["enabledModules"] = {"from": current_mods, "to": new_mods}
                mun.enabled_modules = new_mods

        if "cadsus_user" in fields and payload.cadsus_user != mun.cadsus_user:
            changes["cadsusUser"] = {"from": mun.cadsus_user or "", "to": payload.cadsus_user or ""}
            mun.cadsus_user = payload.cadsus_user or ""
        if "cadsus_password" in fields and payload.cadsus_password is not None:
            # Não logamos o valor da senha — só indica que foi alterada.
            # Armazenada cifrada via Fernet (ver app/core/crypto.py).
            from app.core.crypto import encrypt_secret

            had = bool(mun.cadsus_password)
            mun.cadsus_password = encrypt_secret(payload.cadsus_password) or ""
            if had != bool(payload.cadsus_password):
                changes["cadsusPassword"] = {
                    "from": "(definida)" if had else "(vazia)",
                    "to": "(definida)" if payload.cadsus_password else "(vazia)",
                }

        await self.session.flush()

        # Bairros: se vier no payload, substitui tudo.
        if payload.neighborhoods is not None:
            await self._replace_neighborhoods(mun.id, payload.neighborhoods)
            changes["neighborhoods"] = {"from": None, "to": f"{len(payload.neighborhoods)} item(ns)"}

        if changes:
            from app.core.audit import get_audit_context
            from app.modules.audit.helpers import describe_change, humanize_field
            from app.modules.audit.writer import write_audit

            actor = get_audit_context().user_name
            field_labels = [humanize_field(k) for k in changes]
            await write_audit(
                self.session,
                module="sys",
                action="municipality_update",
                severity="info",
                resource="Municipality",
                resource_id=str(mun.id),
                description=describe_change(
                    actor=actor, verb="editou",
                    target_kind="município", target_name=mun.name,
                    changed_fields=field_labels,
                ),
                details={"municipalityId": str(mun.id), "changes": changes},
            )
        return await self._municipality_detail(mun)

    async def _replace_neighborhoods(
        self, municipality_id: UUID, payload_hoods: list[NeighborhoodInput]
    ) -> None:
        """Replace-all: remove todos os bairros do município e re-insere."""
        from sqlalchemy import delete as sql_delete

        await self.session.execute(
            sql_delete(Neighborhood).where(Neighborhood.municipality_id == municipality_id)
        )
        seen_names: set[str] = set()
        for h in payload_hoods:
            name = h.name.strip()
            if not name or name.lower() in seen_names:
                continue
            seen_names.add(name.lower())
            self.session.add(Neighborhood(
                municipality_id=municipality_id,
                name=name,
                population=h.population,
                latitude=h.latitude,
                longitude=h.longitude,
                territory=h.territory,
            ))
        await self.session.flush()

    async def archive_municipality(self, municipality_id: UUID) -> MunicipalityDetail:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")
        mun.archived = True
        # arquiva também todas as unidades do município
        fac_count = await self.session.scalar(
            select(func.count()).select_from(Facility).where(Facility.municipality_id == mun.id)
        ) or 0
        await self.session.execute(
            Facility.__table__.update()
            .where(Facility.municipality_id == mun.id)
            .values(archived=True)
        )
        await self.session.flush()

        from app.core.audit import get_audit_context
        from app.modules.audit.helpers import describe_change
        from app.modules.audit.writer import write_audit

        actor = get_audit_context().user_name
        await write_audit(
            self.session,
            module="sys",
            action="municipality_archive",
            severity="warning",
            resource="Municipality",
            resource_id=str(mun.id),
            description=describe_change(
                actor=actor, verb="arquivou",
                target_kind="município",
                target_name=f"{mun.name}/{mun.state}",
                extra=f"IBGE {mun.ibge} · {int(fac_count)} unidade(s) arquivada(s) junto",
            ),
            details={
                "municipalityId": str(mun.id),
                "municipalityName": mun.name,
                "municipalityState": mun.state,
                "municipalityIbge": mun.ibge,
                "facilitiesArchived": int(fac_count),
            },
        )
        return await self._municipality_detail(mun)

    async def unarchive_municipality(self, municipality_id: UUID) -> MunicipalityDetail:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")
        mun.archived = False
        await self.session.flush()

        from app.core.audit import get_audit_context
        from app.modules.audit.helpers import describe_change
        from app.modules.audit.writer import write_audit

        actor = get_audit_context().user_name
        await write_audit(
            self.session,
            module="sys",
            action="municipality_unarchive",
            severity="info",
            resource="Municipality",
            resource_id=str(mun.id),
            description=describe_change(
                actor=actor, verb="reativou",
                target_kind="município",
                target_name=f"{mun.name}/{mun.state}",
            ),
            details={
                "municipalityId": str(mun.id),
                "municipalityName": mun.name,
                "municipalityState": mun.state,
                "municipalityIbge": mun.ibge,
            },
        )
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

        changes: dict[str, dict] = {}
        if payload.name is not None and payload.name != fac.name:
            changes["name"] = {"from": fac.name, "to": payload.name}
            fac.name = payload.name
        if payload.short_name is not None and payload.short_name != fac.short_name:
            changes["shortName"] = {"from": fac.short_name, "to": payload.short_name}
            fac.short_name = payload.short_name
        if payload.type is not None:
            try:
                new_type = FacilityType(payload.type)
            except ValueError:
                raise ForbiddenError(f"Tipo de unidade inválido: {payload.type}") from None
            if new_type != fac.type:
                changes["type"] = {
                    "from": fac.type.value if hasattr(fac.type, "value") else str(fac.type),
                    "to": new_type.value,
                }
                fac.type = new_type
        if payload.cnes is not None:
            new_cnes = payload.cnes or None
            if new_cnes != fac.cnes:
                changes["cnes"] = {"from": fac.cnes, "to": new_cnes}
                fac.cnes = new_cnes
        await self.session.flush()

        if changes:
            from app.core.audit import get_audit_context
            from app.modules.audit.helpers import describe_change, humanize_field
            from app.modules.audit.writer import write_audit

            actor = get_audit_context().user_name
            field_labels = [humanize_field(k) for k in changes]
            await write_audit(
                self.session,
                module="sys",
                action="facility_update",
                severity="info",
                resource="Facility",
                resource_id=str(fac.id),
                description=describe_change(
                    actor=actor, verb="editou",
                    target_kind="unidade", target_name=fac.name,
                    changed_fields=field_labels,
                ),
                details={"facilityId": str(fac.id), "changes": changes},
            )
        return fac

    async def _facility_audit_common(self, fac: Facility) -> dict:
        mun = await self.repo.get_municipality(fac.municipality_id)
        return {
            "facilityId": str(fac.id),
            "facilityName": fac.name,
            "facilityShortName": fac.short_name,
            "facilityType": fac.type.value if hasattr(fac.type, "value") else str(fac.type),
            "municipalityId": str(fac.municipality_id),
            "municipalityName": mun.name if mun else "",
            "municipalityState": mun.state if mun else "",
        }

    async def archive_facility(self, facility_id: UUID) -> Facility:
        fac = await self.session.scalar(select(Facility).where(Facility.id == facility_id))
        if fac is None:
            raise NotFoundError("Unidade não encontrada.")
        fac.archived = True
        await self.session.flush()

        from app.core.audit import get_audit_context
        from app.modules.audit.helpers import describe_change
        from app.modules.audit.writer import write_audit

        details = await self._facility_audit_common(fac)
        actor = get_audit_context().user_name
        await write_audit(
            self.session,
            module="sys",
            action="facility_archive",
            severity="warning",
            resource="Facility",
            resource_id=str(fac.id),
            description=describe_change(
                actor=actor, verb="arquivou",
                target_kind="unidade", target_name=fac.name,
                extra=f"{details['municipalityName']}/{details['municipalityState']}",
            ),
            details=details,
        )
        return fac

    async def unarchive_facility(self, facility_id: UUID) -> Facility:
        fac = await self.session.scalar(select(Facility).where(Facility.id == facility_id))
        if fac is None:
            raise NotFoundError("Unidade não encontrada.")
        fac.archived = False
        await self.session.flush()

        from app.core.audit import get_audit_context
        from app.modules.audit.helpers import describe_change
        from app.modules.audit.writer import write_audit

        details = await self._facility_audit_common(fac)
        actor = get_audit_context().user_name
        await write_audit(
            self.session,
            module="sys",
            action="facility_unarchive",
            severity="info",
            resource="Facility",
            resource_id=str(fac.id),
            description=describe_change(
                actor=actor, verb="reativou",
                target_kind="unidade", target_name=fac.name,
                extra=f"{details['municipalityName']}/{details['municipalityState']}",
            ),
            details=details,
        )
        return fac

    # ─── Listas admin (inclui archived opcional) ──────────────────────

    async def list_all_municipalities(self, *, include_archived: bool = False) -> list[MunicipalityDetail]:
        stmt = select(Municipality).order_by(Municipality.name)
        if not include_archived:
            stmt = stmt.where(Municipality.archived== False)
        rows = list((await self.session.scalars(stmt)).all())
        return [await self._municipality_detail(m) for m in rows]

    async def municipality_detail_by_id(self, municipality_id: UUID) -> MunicipalityDetail:
        mun = await self.repo.get_municipality(municipality_id)
        if mun is None:
            raise NotFoundError("Município não encontrado.")
        return await self._municipality_detail(mun)
