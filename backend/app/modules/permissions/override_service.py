"""Serviço de overrides de permissões por acesso específico.

Um `FacilityAccess` tem um ``role_id`` que define a base de permissões do
usuário naquela unidade. Overrides são ajustes finos: "esse usuário aqui
nessa unidade não pode X" (mesmo que o perfil permita) ou "esse usuário
pode Y a mais que o perfil dele".
"""

from __future__ import annotations

import uuid

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.modules.permissions.models import (
    FacilityAccessPermissionOverride,
    Role,
    RoleScope,
)
from app.modules.permissions.repository import RoleRepository
from app.modules.permissions.role_service import _role_to_out
from app.modules.permissions.schemas import (
    AccessPermissionEntry,
    AccessPermissionsDetail,
    AccessPermissionsUpdate,
    RolePermissionState,
)
from app.modules.permissions.service import PermissionService
from app.modules.tenants.models import Facility, FacilityAccess
from app.modules.users.models import User


class AccessPermissionService:
    def __init__(self, db: AsyncSession, valkey: redis.Redis | None = None) -> None:
        self.db = db
        self.valkey = valkey
        self.roles = RoleRepository(db)

    async def detail(
        self,
        *,
        user_id: uuid.UUID,
        access_id: uuid.UUID,
        acting_on_municipality: uuid.UUID | None = None,
    ) -> AccessPermissionsDetail:
        access, facility, user = await self._load_access(
            user_id, access_id, acting_on_municipality
        )

        # Matriz efetiva do role (sem overrides).
        role_effective: dict[str, bool] = {}
        role_out = None
        if access.role_id is not None:
            chain = await self.roles.chain(access.role_id)
            role_ids = [r.id for r in chain]
            by_role = await self.roles.role_permissions_bulk(role_ids)
            for r in reversed(chain):
                role_effective.update(by_role.get(r.id, {}))
            if chain:
                role_out = _role_to_out(chain[0])

        # Overrides atuais.
        overrides_rows = list((await self.db.scalars(
            select(FacilityAccessPermissionOverride).where(
                FacilityAccessPermissionOverride.facility_access_id == access_id
            )
        )).all())
        overrides: dict[str, bool] = {ov.permission_code: ov.granted for ov in overrides_rows}

        # Catálogo completo para montar linhas estáveis.
        perms = await self.roles.list_permissions()
        entries: list[AccessPermissionEntry] = []
        for p in perms:
            if p.code in overrides:
                state = (
                    RolePermissionState.GRANT
                    if overrides[p.code]
                    else RolePermissionState.DENY
                )
            else:
                state = RolePermissionState.INHERIT

            role_eff = role_effective.get(p.code, False)
            effective = overrides.get(p.code, role_eff)
            overridden = state != RolePermissionState.INHERIT and effective != role_eff
            entries.append(
                AccessPermissionEntry(
                    code=p.code,
                    module=p.module,
                    resource=p.resource,
                    action=p.action,
                    description=p.description,
                    state=state,
                    effective=effective,
                    role_effective=role_eff,
                    overridden=overridden,
                )
            )

        return AccessPermissionsDetail(
            user_id=user.id,
            user_name=user.name,
            facility_access_id=access.id,
            facility_id=facility.id,
            facility_name=facility.short_name or facility.name,
            municipality_id=facility.municipality_id,
            role=role_out,
            permissions=entries,
        )

    async def set_overrides(
        self,
        *,
        user_id: uuid.UUID,
        access_id: uuid.UUID,
        payload: AccessPermissionsUpdate,
        acting_on_municipality: uuid.UUID | None = None,
    ) -> AccessPermissionsDetail:
        access, _, _ = await self._load_access(user_id, access_id, acting_on_municipality)

        # Valida códigos.
        from app.core.permissions.registry import has_permission

        for item in payload.permissions:
            if not has_permission(item.code):
                raise ConflictError(f"Permissão desconhecida: {item.code}")

        current = {
            ov.permission_code: ov
            for ov in (await self.db.scalars(
                select(FacilityAccessPermissionOverride).where(
                    FacilityAccessPermissionOverride.facility_access_id == access_id
                )
            )).all()
        }

        desired: dict[str, bool | None] = {}
        for item in payload.permissions:
            if item.state == RolePermissionState.INHERIT:
                desired[item.code] = None
            elif item.state == RolePermissionState.GRANT:
                desired[item.code] = True
            else:
                desired[item.code] = False

        changed = False
        diff: list[dict[str, str]] = []
        for code, target in desired.items():
            existing = current.get(code)
            if target is None:
                if existing is not None:
                    prev = "grant" if existing.granted else "deny"
                    await self.db.delete(existing)
                    diff.append({"code": code, "from": prev, "to": "inherit"})
                    changed = True
            else:
                new_label = "grant" if target else "deny"
                if existing is None:
                    self.db.add(FacilityAccessPermissionOverride(
                        facility_access_id=access_id,
                        permission_code=code,
                        granted=target,
                    ))
                    diff.append({"code": code, "from": "inherit", "to": new_label})
                    changed = True
                elif existing.granted != target:
                    prev = "grant" if existing.granted else "deny"
                    existing.granted = target
                    diff.append({"code": code, "from": prev, "to": new_label})
                    changed = True

        if changed:
            access.version = access.version + 1
            await self.db.flush()

            # Audit trail.
            from app.core.audit import get_audit_context
            from app.modules.audit.helpers import describe_change
            from app.modules.audit.writer import write_audit

            user = await self.db.get(User, user_id)
            actor = get_audit_context().user_name
            await write_audit(
                self.db,
                module="roles",
                action="permission_override",
                severity="warning",
                resource="facility_access",
                resource_id=str(access_id),
                description=describe_change(
                    actor=actor, verb="ajustou permissões do usuário",
                    target_name=user.name if user else str(user_id),
                    extra=f"{len(diff)} permissão(ões) alterada(s)",
                ),
                details={
                    "targetUserId": str(user_id),
                    "targetUserName": user.name if user else "",
                    "facilityAccessId": str(access_id),
                    "changes": diff,
                    "count": len(diff),
                },
            )

            # Invalida cache do acesso.
            svc = PermissionService(self.db, self.valkey)
            await svc.invalidate_access(user_id, access_id)

        return await self.detail(
            user_id=user_id,
            access_id=access_id,
            acting_on_municipality=acting_on_municipality,
        )

    # ── Helpers ─────────────────────────────────────────────────────────

    async def _load_access(
        self,
        user_id: uuid.UUID,
        access_id: uuid.UUID,
        acting_on_municipality: uuid.UUID | None,
    ) -> tuple[FacilityAccess, Facility, User]:
        access = await self.db.get(FacilityAccess, access_id)
        if access is None or access.user_id != user_id:
            raise NotFoundError("Acesso não encontrado.")

        user = await self.db.get(User, user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")

        facility = await self.db.get(Facility, access.facility_id)
        if facility is None:
            raise NotFoundError("Unidade do acesso não encontrada.")

        if (
            acting_on_municipality is not None
            and facility.municipality_id != acting_on_municipality
        ):
            raise ForbiddenError("Acesso pertence a outro município.")

        # Bloqueia override de user MASTER — confusão: MASTER ignora perms.
        if access.role_id is not None:
            role = await self.db.get(Role, access.role_id)
            if role is not None and role.scope == RoleScope.SYSTEM and role.code == "system_admin":
                raise ForbiddenError(
                    "Overrides não se aplicam a MASTER (super-usuário)."
                )

        return access, facility, user
