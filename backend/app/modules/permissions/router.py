"""Rotas de RBAC — escopo **município** (com X-Work-Context).

Apenas perfis do município atual + SYSTEM (visíveis como ancestrais). MASTER
edita via ``/api/v1/admin/roles`` (ver ``admin_router.py``).
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.deps import DB, Valkey, WorkContext, requires
from app.modules.permissions.override_service import AccessPermissionService
from app.modules.permissions.role_service import RoleService
from app.modules.permissions.schemas import (
    AccessPermissionsDetail,
    AccessPermissionsUpdate,
    PermissionGroupOut,
    RoleCreate,
    RoleDetailOut,
    RoleOut,
    RolePermissionsUpdate,
    RoleUpdate,
)

router = APIRouter(tags=["roles"])


# ── Catálogo ────────────────────────────────────────────────────────────


@router.get("/permissions", response_model=list[PermissionGroupOut])
async def list_permissions(
    db: DB,
    ctx: WorkContext = requires(permission="roles.role.view"),
) -> list[PermissionGroupOut]:
    return await RoleService(db).list_permissions_grouped()


# ── Roles (escopo município) ────────────────────────────────────────────


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(
    db: DB,
    include_archived: Annotated[bool, Query()] = False,
    ctx: WorkContext = requires(permission="roles.role.view"),
) -> list[RoleOut]:
    return await RoleService(db).list_for_municipality(
        ctx.municipality_id, include_archived=include_archived
    )


@router.get("/roles/{role_id}", response_model=RoleDetailOut)
async def get_role(
    role_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="roles.role.view"),
) -> RoleDetailOut:
    return await RoleService(db).detail(role_id)


@router.post("/roles", response_model=RoleDetailOut, status_code=201)
async def create_role(
    payload: RoleCreate,
    db: DB,
    valkey: Valkey,
    ctx: WorkContext = requires(permission="roles.role.create"),
) -> RoleDetailOut:
    return await RoleService(db, valkey).create_municipality_role(
        municipality_id=ctx.municipality_id,
        payload=payload,
    )


@router.patch("/roles/{role_id}", response_model=RoleDetailOut)
async def update_role(
    role_id: UUID,
    payload: RoleUpdate,
    db: DB,
    valkey: Valkey,
    ctx: WorkContext = requires(permission="roles.role.edit"),
) -> RoleDetailOut:
    return await RoleService(db, valkey).update(
        role_id,
        payload,
        acting_on_municipality=ctx.municipality_id,
    )


@router.post("/roles/{role_id}/archive", response_model=RoleDetailOut)
async def archive_role(
    role_id: UUID,
    db: DB,
    valkey: Valkey,
    ctx: WorkContext = requires(permission="roles.role.archive"),
) -> RoleDetailOut:
    return await RoleService(db, valkey).archive(
        role_id,
        archived=True,
        acting_on_municipality=ctx.municipality_id,
    )


@router.post("/roles/{role_id}/unarchive", response_model=RoleDetailOut)
async def unarchive_role(
    role_id: UUID,
    db: DB,
    valkey: Valkey,
    ctx: WorkContext = requires(permission="roles.role.archive"),
) -> RoleDetailOut:
    return await RoleService(db, valkey).archive(
        role_id,
        archived=False,
        acting_on_municipality=ctx.municipality_id,
    )


@router.put("/roles/{role_id}/permissions", response_model=RoleDetailOut)
async def set_role_permissions(
    role_id: UUID,
    payload: RolePermissionsUpdate,
    db: DB,
    valkey: Valkey,
    ctx: WorkContext = requires(permission="roles.permission.assign"),
) -> RoleDetailOut:
    return await RoleService(db, valkey).set_permissions(
        role_id,
        payload,
        acting_on_municipality=ctx.municipality_id,
    )


# ── Overrides por acesso ────────────────────────────────────────────────


@router.get(
    "/users/{user_id}/accesses/{access_id}/permissions",
    response_model=AccessPermissionsDetail,
)
async def get_access_permissions(
    user_id: UUID,
    access_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="roles.override.manage"),
) -> AccessPermissionsDetail:
    return await AccessPermissionService(db).detail(
        user_id=user_id,
        access_id=access_id,
        acting_on_municipality=ctx.municipality_id,
    )


@router.put(
    "/users/{user_id}/accesses/{access_id}/permissions",
    response_model=AccessPermissionsDetail,
)
async def set_access_permissions(
    user_id: UUID,
    access_id: UUID,
    payload: AccessPermissionsUpdate,
    db: DB,
    valkey: Valkey,
    ctx: WorkContext = requires(permission="roles.override.manage"),
) -> AccessPermissionsDetail:
    return await AccessPermissionService(db, valkey).set_overrides(
        user_id=user_id,
        access_id=access_id,
        payload=payload,
        acting_on_municipality=ctx.municipality_id,
    )
