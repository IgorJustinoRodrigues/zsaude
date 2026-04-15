"""Serviço de administração de roles (CRUD + matriz de permissões).

Separado de ``PermissionService`` (resolução/cache) pra manter cada arquivo
focado numa responsabilidade.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.modules.permissions.models import (
    Role,
    RolePermission,
    RoleScope,
)
from app.modules.permissions.repository import RoleRepository
from app.modules.permissions.schemas import (
    PermissionGroupOut,
    PermissionOut,
    RoleCreate,
    RoleDetailOut,
    RoleOut,
    RolePermissionEntry,
    RolePermissionsUpdate,
    RolePermissionState,
    RoleScopeLiteral,
    RoleUpdate,
)

if TYPE_CHECKING:
    from app.modules.permissions.models import Permission


class RoleService:
    def __init__(self, db: AsyncSession, valkey: redis.Redis | None = None) -> None:
        self.db = db
        self.repo = RoleRepository(db)
        self.valkey = valkey

    # ── Catálogo ────────────────────────────────────────────────────────

    async def list_permissions_grouped(self) -> list[PermissionGroupOut]:
        perms = await self.repo.list_permissions()
        groups: dict[str, list[PermissionOut]] = {}
        for p in perms:
            groups.setdefault(p.module, []).append(PermissionOut.model_validate(p))
        return [
            PermissionGroupOut(module=mod, permissions=items)
            for mod, items in sorted(groups.items())
        ]

    # ── Listagem ────────────────────────────────────────────────────────

    async def list_for_municipality(
        self, municipality_id: uuid.UUID, *, include_archived: bool = False
    ) -> list[RoleOut]:
        rows = await self.repo.list_all(
            municipality_id=municipality_id,
            include_system=True,
            include_archived=include_archived,
        )
        return [_role_to_out(r) for r in rows]

    async def list_admin(
        self,
        *,
        municipality_id: uuid.UUID | None = None,
        scope: RoleScope | None = None,
        include_archived: bool = True,
    ) -> list[RoleOut]:
        rows = await self.repo.list_admin(
            municipality_id=municipality_id,
            scope=scope,
            include_archived=include_archived,
        )
        return [_role_to_out(r) for r in rows]

    # ── Detalhe com matriz efetiva ──────────────────────────────────────

    async def detail(self, role_id: uuid.UUID) -> RoleDetailOut:
        role = await self.repo.get(role_id)
        if role is None:
            raise NotFoundError("Perfil não encontrado.")

        chain = await self.repo.chain(role_id)
        role_ids = [r.id for r in chain]
        by_role = await self.repo.role_permissions_bulk(role_ids)

        # Mapa efetivo do próprio role (aplicando cadeia completa).
        effective_self: dict[str, bool] = {}
        for r in reversed(chain):
            effective_self.update(by_role.get(r.id, {}))

        # Mapa efetivo do pai (chain sem o próprio role).
        parent_chain = chain[1:] if len(chain) > 1 else []
        effective_parent: dict[str, bool] = {}
        for r in reversed(parent_chain):
            effective_parent.update(by_role.get(r.id, {}))

        # Linhas do próprio role (para determinar state).
        own = by_role.get(role_id, {})

        perms = await self.repo.list_permissions()
        entries: list[RolePermissionEntry] = []
        for p in perms:
            if p.code in own:
                state = (
                    RolePermissionState.GRANT
                    if own[p.code]
                    else RolePermissionState.DENY
                )
            else:
                state = RolePermissionState.INHERIT

            effective = effective_self.get(p.code, False)
            inherited_eff = (
                effective_parent[p.code] if p.code in effective_parent else None
            )
            overridden = (
                p.code in own
                and (p.code in effective_parent)
                and own[p.code] != effective_parent[p.code]
            )
            entries.append(
                RolePermissionEntry(
                    code=p.code,
                    module=p.module,
                    resource=p.resource,
                    action=p.action,
                    description=p.description,
                    state=state,
                    effective=effective,
                    inherited_effective=inherited_eff,
                    overridden_parent=overridden,
                )
            )

        parent_out: RoleOut | None = None
        if role.parent_id is not None and len(chain) > 1:
            parent_out = _role_to_out(chain[1])

        return RoleDetailOut(
            **_role_to_out(role).model_dump(by_alias=False),
            parent=parent_out,
            permissions=entries,
        )

    # ── Create ──────────────────────────────────────────────────────────

    async def create_municipality_role(
        self, *, municipality_id: uuid.UUID, payload: RoleCreate
    ) -> RoleDetailOut:
        if await self.repo.get_by_code(payload.code, municipality_id=municipality_id):
            raise ConflictError("Já existe um perfil com esse código neste município.")

        parent = await self._validate_parent(payload.parent_id, municipality_id)

        role = Role(
            code=payload.code,
            name=payload.name,
            description=payload.description,
            scope=RoleScope.MUNICIPALITY,
            municipality_id=municipality_id,
            parent_id=parent.id if parent else None,
            is_system_base=False,
            archived=False,
        )
        self.db.add(role)
        await self.db.flush()
        await _audit_role(
            self.db, role=role, action="create",
            details={"parentId": str(parent.id) if parent else None},
        )
        return await self.detail(role.id)

    async def create_system_role(self, payload: RoleCreate) -> RoleDetailOut:
        """Cria SYSTEM role (MASTER). Parent só pode ser outro SYSTEM."""
        if await self.repo.get_by_code(payload.code, municipality_id=None):
            raise ConflictError("Já existe um perfil SYSTEM com esse código.")

        parent: Role | None = None
        if payload.parent_id:
            parent = await self.repo.get(payload.parent_id)
            if parent is None or parent.scope != RoleScope.SYSTEM:
                raise ForbiddenError("SYSTEM role só pode herdar de outro SYSTEM.")

        role = Role(
            code=payload.code,
            name=payload.name,
            description=payload.description,
            scope=RoleScope.SYSTEM,
            municipality_id=None,
            parent_id=parent.id if parent else None,
            is_system_base=False,
            archived=False,
        )
        self.db.add(role)
        await self.db.flush()
        await _audit_role(
            self.db, role=role, action="create",
            details={"parentId": str(parent.id) if parent else None},
        )
        return await self.detail(role.id)

    # ── Update ──────────────────────────────────────────────────────────

    async def update(
        self,
        role_id: uuid.UUID,
        payload: RoleUpdate,
        *,
        acting_on_municipality: uuid.UUID | None = None,
    ) -> RoleDetailOut:
        """Atualiza name/description/parent_id.

        ``acting_on_municipality`` vem do contexto do requester (None para
        MASTER): se não-None, restringe edição ao município do role.
        """
        role = await self.repo.get(role_id)
        if role is None:
            raise NotFoundError("Perfil não encontrado.")

        self._check_mun_scope(role, acting_on_municipality)

        changed = False
        if payload.name is not None and payload.name != role.name:
            role.name = payload.name
            changed = True
        if payload.description is not None and payload.description != role.description:
            role.description = payload.description
            changed = True
        if "parent_id" in payload.model_fields_set:
            parent = await self._validate_parent(
                payload.parent_id, role.municipality_id, role_id=role_id
            )
            new_parent_id = parent.id if parent else None
            if new_parent_id != role.parent_id:
                role.parent_id = new_parent_id
                changed = True

        if changed:
            role.version = role.version + 1
            await self.db.flush()
            await _audit_role(
                self.db, role=role, action="update",
                details={"fields": list(payload.model_fields_set)},
            )
            await self._invalidate_chain(role_id)

        return await self.detail(role_id)

    async def archive(
        self,
        role_id: uuid.UUID,
        *,
        archived: bool,
        acting_on_municipality: uuid.UUID | None = None,
    ) -> RoleDetailOut:
        role = await self.repo.get(role_id)
        if role is None:
            raise NotFoundError("Perfil não encontrado.")
        self._check_mun_scope(role, acting_on_municipality)
        if role.is_system_base and archived:
            raise ForbiddenError("Perfis SYSTEM base não podem ser arquivados.")
        if role.archived != archived:
            role.archived = archived
            role.version = role.version + 1
            await self.db.flush()
            await _audit_role(
                self.db, role=role,
                action="archive" if archived else "unarchive",
            )
            await self._invalidate_chain(role_id)
        return await self.detail(role_id)

    # ── Set permissions (matriz) ────────────────────────────────────────

    async def set_permissions(
        self,
        role_id: uuid.UUID,
        payload: RolePermissionsUpdate,
        *,
        acting_on_municipality: uuid.UUID | None = None,
    ) -> RoleDetailOut:
        role = await self.repo.get(role_id)
        if role is None:
            raise NotFoundError("Perfil não encontrado.")
        self._check_mun_scope(role, acting_on_municipality)

        # Valida que todos os códigos existem no catálogo.
        from app.core.permissions.registry import has_permission

        for item in payload.permissions:
            if not has_permission(item.code):
                raise ConflictError(f"Permissão desconhecida: {item.code}")

        # Estado atual.
        current = {rp.permission_code: rp for rp in await self.repo.role_permissions(role_id)}
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

        # Apply diffs.
        for code, target in desired.items():
            rp = current.get(code)
            if target is None:
                if rp is not None:
                    prev = "grant" if rp.granted else "deny"
                    await self.db.delete(rp)
                    diff.append({"code": code, "from": prev, "to": "inherit"})
                    changed = True
            else:
                new_label = "grant" if target else "deny"
                if rp is None:
                    self.db.add(RolePermission(
                        role_id=role_id,
                        permission_code=code,
                        granted=target,
                    ))
                    diff.append({"code": code, "from": "inherit", "to": new_label})
                    changed = True
                elif rp.granted != target:
                    prev = "grant" if rp.granted else "deny"
                    rp.granted = target
                    diff.append({"code": code, "from": prev, "to": new_label})
                    changed = True

        if changed:
            role.version = role.version + 1
            await self.db.flush()
            await _audit_role(
                self.db, role=role, action="permissions_set",
                details={"changes": diff, "count": len(diff)},
            )
            await self._invalidate_chain(role_id)

        return await self.detail(role_id)

    # ── Helpers ─────────────────────────────────────────────────────────

    def _check_mun_scope(
        self, role: Role, acting_on_municipality: uuid.UUID | None
    ) -> None:
        """Restringe mutação ao escopo do solicitante.

        - ``acting_on_municipality=None`` (MASTER) → qualquer coisa.
        - Caso contrário, só roles MUNICIPALITY do próprio município.
        """
        if acting_on_municipality is None:
            return
        if role.scope == RoleScope.SYSTEM:
            raise ForbiddenError("Perfis SYSTEM só podem ser editados pelo MASTER.")
        if role.municipality_id != acting_on_municipality:
            raise ForbiddenError("Perfil pertence a outro município.")

    async def _validate_parent(
        self,
        parent_id: uuid.UUID | None,
        municipality_id: uuid.UUID | None,
        *,
        role_id: uuid.UUID | None = None,
    ) -> Role | None:
        if parent_id is None:
            return None
        parent = await self.repo.get(parent_id)
        if parent is None:
            raise NotFoundError("Perfil pai não encontrado.")
        if parent.scope == RoleScope.MUNICIPALITY and parent.municipality_id != municipality_id:
            raise ForbiddenError("Perfil pai deve ser SYSTEM ou do mesmo município.")
        if role_id is not None:
            # Evita ciclo: parent não pode estar na cadeia do próprio role.
            chain = await self.repo.chain(parent_id)
            if any(r.id == role_id for r in chain):
                raise ConflictError("Não é possível criar ciclo de herança.")
        return parent

    async def _invalidate_chain(self, role_id: uuid.UUID) -> None:
        """Bumpa version dos descendentes e limpa cache de usuários afetados."""
        descendants = await self.repo.descendants(role_id)
        for d in descendants:
            d.version = d.version + 1
        await self.db.flush()

        # Limpa entradas de cache dos users impactados.
        from app.modules.permissions.service import PermissionService

        if self.valkey is None:
            return
        user_ids = await self.repo.users_with_role_in_chain(role_id)
        svc = PermissionService(self.db, self.valkey)
        for uid in user_ids:
            await svc.invalidate_user(uid)


# ─── Helpers locais ──────────────────────────────────────────────────────


def _role_to_out(role: Role) -> RoleOut:
    return RoleOut(
        id=role.id,
        code=role.code,
        name=role.name,
        description=role.description,
        scope=RoleScopeLiteral(role.scope.value),
        municipality_id=role.municipality_id,
        parent_id=role.parent_id,
        is_system_base=role.is_system_base,
        archived=role.archived,
        version=role.version,
    )


async def _audit_role(
    db: AsyncSession,
    *,
    role: Role,
    action: str,
    details: dict | None = None,
) -> None:
    """Registra evento de mutação em role. Severidade maior para SYSTEM."""
    from app.modules.audit.writer import write_audit

    payload: dict = {
        "roleCode": role.code,
        "scope": role.scope.value,
    }
    if role.municipality_id:
        payload["municipalityId"] = str(role.municipality_id)
    if details:
        payload.update(details)

    await write_audit(
        db,
        module="roles",
        action=action,
        severity="warning" if role.scope == RoleScope.SYSTEM else "info",
        resource="role",
        resource_id=str(role.id),
        description=f"{action} role {role.code} ({role.scope.value})",
        details=payload,
    )
