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

    async def get_by_login_or_email(self, identifier: str) -> User | None:
        ident = identifier.strip().lower()
        stmt = select(User).where(or_(User.login == ident, User.email == ident))
        return await self.session.scalar(stmt)

    async def get_by_login(self, login: str) -> User | None:
        return await self.session.scalar(select(User).where(User.login == login.strip().lower()))

    async def get_by_email(self, email: str) -> User | None:
        return await self.session.scalar(select(User).where(User.email == email.strip().lower()))

    async def get_by_cpf(self, cpf: str) -> User | None:
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
        facilities: list[tuple[UUID, str, list[str]]],
    ) -> None:
        """Substitui todos os vínculos do usuário de forma atômica.

        `facilities` é lista de tuplas (facility_id, role, modules).
        """
        from sqlalchemy import delete

        await self.session.execute(delete(FacilityAccess).where(FacilityAccess.user_id == user_id))
        await self.session.execute(delete(MunicipalityAccess).where(MunicipalityAccess.user_id == user_id))

        for mid in municipality_ids:
            self.session.add(MunicipalityAccess(user_id=user_id, municipality_id=mid))
        for fid, role, modules in facilities:
            self.session.add(
                FacilityAccess(user_id=user_id, facility_id=fid, role=role, modules=modules)
            )
        await self.session.flush()

    async def facility_modules(self, user_id: UUID) -> list[str]:
        """Agregado: todos os módulos distintos que o usuário acessa em qualquer unidade."""
        stmt = select(FacilityAccess.modules).where(FacilityAccess.user_id == user_id)
        rows = (await self.session.execute(stmt)).all()
        out: set[str] = set()
        for (arr,) in rows:
            for m in arr or []:
                out.add(m)
        return sorted(out)
