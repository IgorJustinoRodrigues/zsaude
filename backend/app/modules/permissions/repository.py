"""Queries do RBAC."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.permissions.models import (
    Permission,
    Role,
    RolePermission,
    RoleScope,
)


class RoleRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Permissions ─────────────────────────────────────────────────────

    async def list_permissions(self) -> list[Permission]:
        rows = await self.db.scalars(select(Permission).order_by(Permission.code))
        return list(rows.all())

    # ── Roles ───────────────────────────────────────────────────────────

    async def get(self, role_id: uuid.UUID) -> Role | None:
        return await self.db.get(Role, role_id)

    async def get_by_code(
        self, code: str, *, municipality_id: uuid.UUID | None
    ) -> Role | None:
        stmt = select(Role).where(Role.code == code)
        if municipality_id is None:
            stmt = stmt.where(Role.municipality_id.is_(None))
        else:
            stmt = stmt.where(Role.municipality_id == municipality_id)
        return await self.db.scalar(stmt)

    async def list_all(
        self,
        *,
        municipality_id: uuid.UUID | None = None,
        include_system: bool = True,
        include_archived: bool = False,
    ) -> list[Role]:
        """Lista roles aplicáveis ao escopo informado.

        - ``municipality_id=None`` + ``include_system=True`` → só SYSTEM.
        - ``municipality_id=<uuid>`` + ``include_system=True`` →
          SYSTEM ∪ MUNICIPALITY do município informado (caso do /roles).
        - ``municipality_id=<uuid>`` + ``include_system=False`` →
          só MUNICIPALITY do município informado.
        """
        stmt = select(Role)
        clauses = []
        if include_system:
            clauses.append(Role.municipality_id.is_(None))
        if municipality_id is not None:
            clauses.append(Role.municipality_id == municipality_id)
        if not clauses:
            # Nenhum filtro de escopo → não retorna nada (evita vazar roles
            # de outros municípios sem querer).
            return []
        stmt = stmt.where(or_(*clauses))
        if not include_archived:
            stmt = stmt.where(Role.archived== False)
        stmt = stmt.order_by(Role.scope, Role.name)
        return list((await self.db.scalars(stmt)).all())

    async def list_admin(
        self,
        *,
        municipality_id: uuid.UUID | None = None,
        scope: RoleScope | None = None,
        include_archived: bool = True,
    ) -> list[Role]:
        """Listagem irrestrita (MASTER). Se ``municipality_id`` vier, filtra."""
        stmt = select(Role)
        if scope is not None:
            stmt = stmt.where(Role.scope == scope)
        if municipality_id is not None:
            stmt = stmt.where(Role.municipality_id == municipality_id)
        if not include_archived:
            stmt = stmt.where(Role.archived== False)
        stmt = stmt.order_by(Role.scope, Role.name)
        return list((await self.db.scalars(stmt)).all())

    async def chain(self, role_id: uuid.UUID, *, max_depth: int = 16) -> list[Role]:
        """Cadeia role → parent → ... → base (mais específico primeiro)."""
        chain: list[Role] = []
        current: uuid.UUID | None = role_id
        seen: set[uuid.UUID] = set()
        for _ in range(max_depth):
            if current is None or current in seen:
                break
            role = await self.db.get(Role, current)
            if role is None:
                break
            seen.add(current)
            chain.append(role)
            current = role.parent_id
        return chain

    async def descendants(self, role_id: uuid.UUID) -> list[Role]:
        """Todos os roles que têm este como ancestral (não incluso o próprio).

        Usado na invalidação: mudar role pai afeta resolução dos filhos.
        """
        from sqlalchemy import text

        dialect = self.db.bind.dialect.name
        if dialect == "oracle":
            sql = """
                SELECT id FROM "APP".ROLES
                START WITH parent_id = :root_id
                CONNECT BY PRIOR id = parent_id
            """
            params = {"root_id": role_id.bytes if hasattr(role_id, 'bytes') else role_id}
        else:
            sql = """
                WITH RECURSIVE tree AS (
                    SELECT id FROM app.roles WHERE parent_id = :root_id
                    UNION
                    SELECT r.id FROM app.roles r JOIN tree t ON r.parent_id = t.id
                )
                SELECT id FROM tree
            """
            params = {"root_id": role_id}
        result = await self.db.execute(text(sql), params)
        ids = [row[0] for row in result.all()]
        if not ids:
            return []
        rows = await self.db.scalars(select(Role).where(Role.id.in_(ids)))
        return list(rows.all())

    async def users_with_role_in_chain(self, role_id: uuid.UUID) -> list[uuid.UUID]:
        """User IDs que têm acesso cujo role_id está em {role_id} ∪ descendants.

        Usado na invalidação de cache após mudança de permissões.
        """
        from app.modules.tenants.models import FacilityAccess

        descendants = await self.descendants(role_id)
        ids = [role_id, *(d.id for d in descendants)]
        rows = await self.db.scalars(
            select(FacilityAccess.user_id)
            .where(FacilityAccess.role_id.in_(ids))
            .distinct()
        )
        return list(rows.all())

    # ── Role permissions (grants/denies explícitos) ─────────────────────

    async def role_permissions(self, role_id: uuid.UUID) -> list[RolePermission]:
        rows = await self.db.scalars(
            select(RolePermission).where(RolePermission.role_id == role_id)
        )
        return list(rows.all())

    async def role_permissions_bulk(
        self, role_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, dict[str, bool]]:
        if not role_ids:
            return {}
        rows = list((await self.db.scalars(
            select(RolePermission).where(RolePermission.role_id.in_(role_ids))
        )).all())
        out: dict[uuid.UUID, dict[str, bool]] = {rid: {} for rid in role_ids}
        for rp in rows:
            out[rp.role_id][rp.permission_code] = rp.granted
        return out
