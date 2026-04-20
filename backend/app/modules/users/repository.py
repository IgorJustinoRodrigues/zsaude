"""Repositório de usuários."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.models import Facility, FacilityAccess, Municipality, MunicipalityAccess
from app.modules.users.models import User, UserStatus


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        return await self.session.scalar(select(User).where(User.id == user_id))

    async def get_by_identifier(self, identifier: str) -> User | None:
        """Lookup por CPF (com ou sem máscara) ou e-mail.

        Não tenta mais casar com ``login``: o sistema só aceita CPF ou
        e-mail como credencial.
        """
        ident = identifier.strip().lower()
        cpf_digits = "".join(ch for ch in ident if ch.isdigit())
        conditions = [User.email == ident]
        if len(cpf_digits) == 11:
            conditions.append(User.cpf == cpf_digits)
        stmt = select(User).where(or_(*conditions))
        return await self.session.scalar(stmt)

    async def get_by_login(self, login: str) -> User | None:
        return await self.session.scalar(select(User).where(User.login == login.strip().lower()))

    async def get_by_email(self, email: str | None) -> User | None:
        if not email:
            return None
        return await self.session.scalar(select(User).where(User.email == email.strip().lower()))

    async def get_by_cpf(self, cpf: str | None) -> User | None:
        if not cpf:
            return None
        return await self.session.scalar(select(User).where(User.cpf == cpf))

    async def add(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        return user

    async def update(self, user: User) -> User:
        await self.session.flush()
        return user

    async def list(
        self,
        *,
        search: str | None = None,
        status: UserStatus | None = None,
        module: str | None = None,
        scope: set[UUID] | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[User], int]:
        stmt = select(User)

        if search:
            q = f"%{search.lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(User.name).like(q),
                    func.lower(User.email).like(q),
                    func.lower(User.login).like(q),
                    User.cpf.like(f"%{search}%"),
                    func.lower(User.primary_role).like(q),
                )
            )
        if status is not None:
            stmt = stmt.where(User.status == status)
        if module:
            # Usuário com pelo menos um facility_access contendo o módulo
            sub = (
                select(FacilityAccess.user_id)
                .where(FacilityAccess.modules.any(module.lower()))
                .distinct()
            )
            stmt = stmt.where(User.id.in_(sub))
        if scope is not None:
            # Escopo do ator (ADMIN): usuário só aparece se tiver MunicipalityAccess
            # em algum município do escopo.
            sub_scope = (
                select(MunicipalityAccess.user_id)
                .where(MunicipalityAccess.municipality_id.in_(scope))
                .distinct()
            )
            stmt = stmt.where(User.id.in_(sub_scope))

        # total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.scalar(count_stmt)) or 0

        stmt = stmt.order_by(User.name).offset((page - 1) * page_size).limit(page_size)
        rows = list((await self.session.scalars(stmt)).all())
        return rows, int(total)

    # ─── Acessos ─────────────────────────────────────────────────────────────

    async def list_municipality_accesses(self, user_id: UUID) -> list[MunicipalityAccess]:
        stmt = select(MunicipalityAccess).where(MunicipalityAccess.user_id == user_id)
        return list((await self.session.scalars(stmt)).all())

    async def list_facility_accesses(self, user_id: UUID) -> list[tuple[FacilityAccess, Facility, Municipality]]:
        stmt = (
            select(FacilityAccess, Facility, Municipality)
            .join(Facility, Facility.id == FacilityAccess.facility_id)
            .join(Municipality, Municipality.id == Facility.municipality_id)
            .where(FacilityAccess.user_id == user_id)
            .order_by(Municipality.name, Facility.name)
        )
        return [tuple(r) for r in (await self.session.execute(stmt)).all()]

    async def replace_accesses(
        self,
        user_id: UUID,
        municipality_ids: set[UUID],
        facilities: list[tuple[UUID, UUID, str | None, str | None, str | None, str | None, str | None]],
    ) -> None:
        """Substitui todos os vínculos do usuário de forma atômica.

        ``facilities`` é lista de tuplas
        ``(facility_id, role_id, cbo_id, cbo_description, cnes_professional_id,
           cnes_snapshot_cpf, cnes_snapshot_nome)``.
        Os cinco últimos podem ser ``None`` — acesso sem vínculo CNES.
        """
        from sqlalchemy import delete

        await self.session.execute(delete(FacilityAccess).where(FacilityAccess.user_id == user_id))
        await self.session.execute(delete(MunicipalityAccess).where(MunicipalityAccess.user_id == user_id))

        for mid in municipality_ids:
            self.session.add(MunicipalityAccess(user_id=user_id, municipality_id=mid))
        for fid, role_id, cbo_id, cbo_desc, cnes_prof_id, snap_cpf, snap_nome in facilities:
            self.session.add(
                FacilityAccess(
                    user_id=user_id,
                    facility_id=fid,
                    role_id=role_id,
                    cbo_id=cbo_id,
                    cbo_description=cbo_desc,
                    cnes_professional_id=cnes_prof_id,
                    cnes_snapshot_cpf=snap_cpf,
                    cnes_snapshot_nome=snap_nome,
                )
            )
        await self.session.flush()

    async def bulk_modules_by_user(self, user_ids: list[UUID]) -> dict[UUID, set[str]]:
        """Módulos acessados por usuário (agregado, considera herança de roles).

        Via CTE recursiva: para cada ``facility_access.role_id``, caminha a
        cadeia ``parent_id → parent_id → ...`` e acumula grants explícitos
        em qualquer ancestral.

        Simplificações em troca de ser barato para listagem:
        - Ignora ``granted=false`` (denies explícitos) — grants "vencem" aqui
          para o agregado. A autorização real (resolve) aplica precedência.
        - Ignora overrides por acesso.

        Usar para "quais módulos esse usuário toca". Para checagem fina
        use ``ctx.permissions``.
        """
        if not user_ids:
            return {}

        from sqlalchemy import text

        dialect = self.session.bind.dialect.name
        if dialect == "oracle":
            # Oracle: CONNECT BY em vez de WITH RECURSIVE, IN em vez de ANY
            placeholders = ", ".join(f":uid_{i}" for i in range(len(user_ids)))
            sql = f"""
                SELECT DISTINCT fa.user_id, p.module
                  FROM "APP".FACILITY_ACCESSES fa
                  JOIN (
                    SELECT id AS source_id, id AS ancestor_id FROM "APP".ROLES
                    UNION ALL
                    SELECT CONNECT_BY_ROOT id, id
                      FROM "APP".ROLES
                     START WITH parent_id IS NOT NULL
                   CONNECT BY PRIOR parent_id = id
                  ) rc ON rc.source_id = fa.role_id
                  JOIN "APP".ROLE_PERMISSIONS rp
                    ON rp.role_id = rc.ancestor_id AND rp.granted = 1
                  JOIN "APP".PERMISSIONS p
                    ON p.code = rp.permission_code
                 WHERE fa.user_id IN ({placeholders})
            """
            params = {f"uid_{i}": uid.bytes for i, uid in enumerate(user_ids)}
        else:
            sql = """
                WITH RECURSIVE role_chain(source_id, ancestor_id) AS (
                    SELECT id, id FROM app.roles
                    UNION
                    SELECT rc.source_id, r.parent_id
                      FROM role_chain rc
                      JOIN app.roles r ON r.id = rc.ancestor_id
                     WHERE r.parent_id IS NOT NULL
                )
                SELECT DISTINCT fa.user_id, p.module
                  FROM app.facility_accesses fa
                  JOIN role_chain rc ON rc.source_id = fa.role_id
                  JOIN app.role_permissions rp
                    ON rp.role_id = rc.ancestor_id AND rp.granted = true
                  JOIN app.permissions p
                    ON p.code = rp.permission_code
                 WHERE fa.user_id = ANY(:user_ids)
            """
            params = {"user_ids": user_ids}
        rows = (await self.session.execute(text(sql), params)).all()
        out: dict[UUID, set[str]] = {uid: set() for uid in user_ids}
        for uid, module in rows:
            # Oracle (RAW(16)) retorna bytes em ``text()`` cru; PG retorna UUID.
            if isinstance(uid, bytes):
                uid = UUID(bytes=uid)
            out[uid].add(module)
        return out
