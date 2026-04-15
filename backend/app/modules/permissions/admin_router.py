"""Rotas de RBAC — escopo **MASTER** (gestão global, sem X-Work-Context).

MASTER gerencia perfis SYSTEM e também pode operar sobre perfis de qualquer
município (para suporte).
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.deps import DB, MasterDep, Valkey
from app.modules.permissions.models import RoleScope
from app.modules.permissions.override_service import AccessPermissionService
from app.modules.permissions.role_service import RoleService
from app.modules.permissions.schemas import (
    AccessPermissionsDetail,
    AccessPermissionsUpdate,
    RoleCreate,
    RoleDetailOut,
    RoleOut,
    RolePermissionsUpdate,
    RoleScopeLiteral,
    RoleUpdate,
)

router = APIRouter(prefix="/admin/roles", tags=["admin-roles"])

# Router separado para /admin/users/... (overrides por acesso acessados pelo MASTER).
access_router = APIRouter(prefix="/admin/users", tags=["admin-access-permissions"])


@router.get("", response_model=list[RoleOut])
async def list_roles_admin(
    db: DB,
    user: MasterDep,
    municipality_id: Annotated[UUID | None, Query(alias="municipalityId")] = None,
    scope: Annotated[RoleScopeLiteral | None, Query()] = None,
    include_archived: Annotated[bool, Query(alias="includeArchived")] = True,
) -> list[RoleOut]:
    scope_value = RoleScope(scope.value) if scope else None
    return await RoleService(db).list_admin(
        municipality_id=municipality_id,
        scope=scope_value,
        include_archived=include_archived,
    )


@router.get("/{role_id}", response_model=RoleDetailOut)
async def get_role_admin(
    role_id: UUID,
    db: DB,
    user: MasterDep,
) -> RoleDetailOut:
    return await RoleService(db).detail(role_id)


@router.post("", response_model=RoleDetailOut, status_code=201)
async def create_role_admin(
    payload: RoleCreate,
    db: DB,
    valkey: Valkey,
    user: MasterDep,
    municipality_id: Annotated[UUID | None, Query(alias="municipalityId")] = None,
) -> RoleDetailOut:
    """Cria um perfil.

    - Sem ``municipalityId`` → SYSTEM.
    - Com ``municipalityId`` → MUNICIPALITY daquele município.
    """
    svc = RoleService(db, valkey)
    if municipality_id is None:
        return await svc.create_system_role(payload)
    return await svc.create_municipality_role(
        municipality_id=municipality_id,
        payload=payload,
    )


@router.patch("/{role_id}", response_model=RoleDetailOut)
async def update_role_admin(
    role_id: UUID,
    payload: RoleUpdate,
    db: DB,
    valkey: Valkey,
    user: MasterDep,
) -> RoleDetailOut:
    # MASTER não é restrito por município.
    return await RoleService(db, valkey).update(role_id, payload, acting_on_municipality=None)


@router.post("/{role_id}/archive", response_model=RoleDetailOut)
async def archive_role_admin(
    role_id: UUID,
    db: DB,
    valkey: Valkey,
    user: MasterDep,
) -> RoleDetailOut:
    return await RoleService(db, valkey).archive(role_id, archived=True, acting_on_municipality=None)


@router.post("/{role_id}/unarchive", response_model=RoleDetailOut)
async def unarchive_role_admin(
    role_id: UUID,
    db: DB,
    valkey: Valkey,
    user: MasterDep,
) -> RoleDetailOut:
    return await RoleService(db, valkey).archive(role_id, archived=False, acting_on_municipality=None)


@router.put("/{role_id}/permissions", response_model=RoleDetailOut)
async def set_role_permissions_admin(
    role_id: UUID,
    payload: RolePermissionsUpdate,
    db: DB,
    valkey: Valkey,
    user: MasterDep,
) -> RoleDetailOut:
    return await RoleService(db, valkey).set_permissions(
        role_id, payload, acting_on_municipality=None
    )


# ── Overrides por acesso (MASTER, sem contexto) ─────────────────────────


@access_router.get(
    "/{user_id}/accesses/{access_id}/permissions",
    response_model=AccessPermissionsDetail,
)
async def get_access_permissions_admin(
    user_id: UUID,
    access_id: UUID,
    db: DB,
    user: MasterDep,
) -> AccessPermissionsDetail:
    return await AccessPermissionService(db).detail(
        user_id=user_id,
        access_id=access_id,
        acting_on_municipality=None,
    )


@access_router.put(
    "/{user_id}/accesses/{access_id}/permissions",
    response_model=AccessPermissionsDetail,
)
async def set_access_permissions_admin(
    user_id: UUID,
    access_id: UUID,
    payload: AccessPermissionsUpdate,
    db: DB,
    valkey: Valkey,
    user: MasterDep,
) -> AccessPermissionsDetail:
    return await AccessPermissionService(db, valkey).set_overrides(
        user_id=user_id,
        access_id=access_id,
        payload=payload,
        acting_on_municipality=None,
    )
