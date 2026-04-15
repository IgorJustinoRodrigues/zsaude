"""Serviço de usuários."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.pagination import Page
from app.core.security import generate_opaque_token, hash_password
from app.modules.tenants.models import Facility, Municipality
from app.modules.users.models import User, UserLevel, UserStatus
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import (
    AdminResetPasswordRequest,
    AdminResetPasswordResponse,
    FacilityAccessDetail,
    MunicipalityAccessDetail,
    UserCreate,
    UserDetail,
    UserListItem,
    UserListParams,
    UserUpdate,
    UserUpdateMe,
)

# Módulos válidos (deve espelhar o backend/modelos)
VALID_MODULES = {"cln", "dgn", "hsp", "pln", "fsc", "ops"}

# Comprimento mínimo de senha gerada por admin (mix de letras/números/símbolos)
PROVISIONAL_PASSWORD_LEN = 12


def _gen_provisional_password() -> str:
    # token_urlsafe já dá ~16 chars; suficiente e aleatório. O prefixo garante
    # um caractere não-letra para passar por políticas simples no front.
    return "Zs" + generate_opaque_token(12)[:PROVISIONAL_PASSWORD_LEN]


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = UserRepository(session)

    async def get_or_404(self, user_id: UUID) -> User:
        user = await self.repo.get_by_id(user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        return user

    # ─── Scope (ADMIN só vê/edita dentro dos seus municípios) ───────────────

    async def actor_scope(self, actor: User) -> set[UUID] | None:
        """Retorna os IDs de município do ator.

        MASTER não tem escopo (retorna None → "vê tudo").
        ADMIN/USER retornam os municípios vinculados via MunicipalityAccess.
        """
        if actor.level == UserLevel.MASTER:
            return None
        from app.modules.tenants.models import MunicipalityAccess
        rows = await self.session.scalars(
            select(MunicipalityAccess.municipality_id).where(
                MunicipalityAccess.user_id == actor.id
            )
        )
        return set(rows.all())

    async def ensure_target_in_scope(self, actor: User, target_id: UUID) -> None:
        """Lança ForbiddenError se o alvo não está no escopo do ator.

        MASTER passa direto. Ator editando a si mesmo passa direto.
        """
        if actor.level == UserLevel.MASTER:
            return
        if actor.id == target_id:
            return
        scope = await self.actor_scope(actor)
        if not scope:
            raise ForbiddenError("Você não administra nenhum município.")
        from app.modules.tenants.models import MunicipalityAccess
        hit = await self.session.scalar(
            select(MunicipalityAccess.user_id)
            .where(
                MunicipalityAccess.user_id == target_id,
                MunicipalityAccess.municipality_id.in_(scope),
            )
            .limit(1)
        )
        if hit is None:
            raise ForbiddenError("Usuário fora do seu escopo de administração.")

    def _ensure_payload_in_scope(
        self, scope: set[UUID] | None, payload_muns: list
    ) -> None:
        """Payload de create/update não pode referenciar município fora do escopo."""
        if scope is None:
            return  # MASTER
        for m in payload_muns:
            if m.municipality_id not in scope:
                raise ForbiddenError(
                    "Você não pode atribuir acesso a município fora do seu escopo."
                )

    async def update_me(self, user_id: UUID, payload: UserUpdateMe) -> User:
        user = await self.get_or_404(user_id)
        if payload.name is not None:
            user.name = payload.name
        if payload.phone is not None:
            user.phone = payload.phone
        if payload.email is not None:
            # checa colisão
            other = await self.repo.get_by_email(payload.email)
            if other and other.id != user.id:
                raise ConflictError("E-mail já cadastrado para outro usuário.")
            user.email = payload.email
        await self.repo.update(user)
        return user

    # ─── Admin: listagem ─────────────────────────────────────────────────────

    async def list(
        self, params: UserListParams, *, scope: set[UUID] | None = None,
    ) -> Page[UserListItem]:
        status_enum: UserStatus | None = UserStatus(params.status) if params.status else None
        rows, total = await self.repo.list(
            search=params.search,
            status=status_enum,
            module=params.module,
            scope=scope,
            page=params.page,
            page_size=params.page_size,
        )

        ids = [r.id for r in rows]
        counts_by_user: dict[UUID, tuple[int, int, set[str]]] = {uid: (0, 0, set()) for uid in ids}

        if ids:
            from app.modules.tenants.models import FacilityAccess, MunicipalityAccess

            mun_stmt = select(MunicipalityAccess).where(MunicipalityAccess.user_id.in_(ids))
            for ma in (await self.session.scalars(mun_stmt)).all():
                muns, facs, mods = counts_by_user[ma.user_id]
                counts_by_user[ma.user_id] = (muns + 1, facs, mods)

            fac_stmt = select(FacilityAccess).where(FacilityAccess.user_id.in_(ids))
            for fa in (await self.session.scalars(fac_stmt)).all():
                muns, facs, mods = counts_by_user[fa.user_id]
                mods.update(fa.modules or [])
                counts_by_user[fa.user_id] = (muns, facs + 1, mods)

        items = [
            UserListItem(
                id=u.id,
                login=u.login,
                email=u.email,
                name=u.name,
                cpf=u.cpf,
                phone=u.phone,
                status=u.status.value if hasattr(u.status, "value") else str(u.status),
                level=u.level.value if hasattr(u.level, "value") else str(u.level),
                primary_role=u.primary_role,
                created_at=u.created_at,
                municipality_count=counts_by_user[u.id][0],
                facility_count=counts_by_user[u.id][1],
                modules=sorted(counts_by_user[u.id][2]),
            )
            for u in rows
        ]

        return Page[UserListItem](items=items, total=total, page=params.page, page_size=params.page_size)

    # ─── Admin: detalhe ──────────────────────────────────────────────────────

    async def detail(self, user_id: UUID) -> UserDetail:
        user = await self.get_or_404(user_id)
        fac_rows = await self.repo.list_facility_accesses(user_id)

        # Agrupa por município
        by_mun: dict[UUID, dict] = {}
        for fa, fac, mun in fac_rows:
            key = mun.id
            if key not in by_mun:
                by_mun[key] = {
                    "municipality_id": mun.id,
                    "municipality_name": mun.name,
                    "municipality_state": mun.state,
                    "facilities": [],
                }
            by_mun[key]["facilities"].append(
                FacilityAccessDetail(
                    facility_id=fac.id,
                    facility_name=fac.name,
                    facility_short_name=fac.short_name,
                    facility_type=fac.type.value if hasattr(fac.type, "value") else str(fac.type),
                    role=fa.role,
                    modules=list(fa.modules or []),
                )
            )

        # Inclui municípios onde o usuário tem vínculo mas nenhuma unidade
        mun_accesses = await self.repo.list_municipality_accesses(user_id)
        for ma in mun_accesses:
            if ma.municipality_id not in by_mun:
                mun = await self.session.scalar(select(Municipality).where(Municipality.id == ma.municipality_id))
                if mun:
                    by_mun[ma.municipality_id] = {
                        "municipality_id": mun.id,
                        "municipality_name": mun.name,
                        "municipality_state": mun.state,
                        "facilities": [],
                    }

        municipalities = [MunicipalityAccessDetail(**d) for d in by_mun.values()]
        # Ordena pelo nome do município
        municipalities.sort(key=lambda m: m.municipality_name)

        return UserDetail(
            id=user.id,
            login=user.login,
            email=user.email,
            name=user.name,
            cpf=user.cpf,
            phone=user.phone,
            status=user.status.value if hasattr(user.status, "value") else str(user.status),
            level=user.level.value if hasattr(user.level, "value") else str(user.level),
            primary_role=user.primary_role,
            is_active=user.is_active,
            is_superuser=user.is_superuser,
            birth_date=user.birth_date,
            created_at=user.created_at,
            updated_at=user.updated_at,
            municipalities=municipalities,
        )

    # ─── Admin: criar ────────────────────────────────────────────────────────

    async def create(self, payload: UserCreate, *, scope: set[UUID] | None = None) -> User:
        self._ensure_payload_in_scope(scope, payload.municipalities)

        if await self.repo.get_by_login(payload.login):
            raise ConflictError("Login já está em uso.")
        if await self.repo.get_by_email(payload.email):
            raise ConflictError("E-mail já está em uso.")
        if await self.repo.get_by_cpf(payload.cpf):
            raise ConflictError("CPF já está em uso.")

        status_enum = UserStatus(payload.status)
        level_enum = UserLevel(payload.level)
        user = User(
            login=payload.login,
            email=payload.email,
            name=payload.name,
            cpf=payload.cpf,
            phone=payload.phone,
            password_hash=hash_password(payload.password),
            status=status_enum,
            is_active=status_enum != UserStatus.BLOQUEADO,
            is_superuser=(level_enum == UserLevel.MASTER),
            primary_role=payload.primary_role,
            level=level_enum,
        )
        await self.repo.add(user)
        await self._apply_accesses(user.id, payload.municipalities, scope=scope)
        return user

    # ─── Admin: atualizar ────────────────────────────────────────────────────

    async def update(
        self, user_id: UUID, payload: UserUpdate, *, scope: set[UUID] | None = None,
    ) -> User:
        if payload.municipalities is not None:
            self._ensure_payload_in_scope(scope, payload.municipalities)
        user = await self.get_or_404(user_id)

        if payload.email is not None and payload.email != user.email:
            other = await self.repo.get_by_email(payload.email)
            if other and other.id != user.id:
                raise ConflictError("E-mail já cadastrado para outro usuário.")
            user.email = payload.email

        if payload.name is not None:
            user.name = payload.name
        if payload.phone is not None:
            user.phone = payload.phone
        if payload.primary_role is not None:
            user.primary_role = payload.primary_role

        if payload.status is not None:
            new_status = UserStatus(payload.status)
            user.status = new_status
            user.is_active = new_status != UserStatus.BLOQUEADO
            if new_status != UserStatus.ATIVO:
                # Invalida tokens em circulação
                user.token_version += 1

        if payload.level is not None:
            new_level = UserLevel(payload.level)
            if user.level != new_level:
                user.level = new_level
                user.is_superuser = (new_level == UserLevel.MASTER)
                # Mudança de nível invalida sessões ativas
                user.token_version += 1

        await self.repo.update(user)

        if payload.municipalities is not None:
            await self._apply_accesses(user.id, payload.municipalities, scope=scope)

        return user

    async def _apply_accesses(
        self,
        user_id: UUID,
        tree: list,
        *,
        scope: set[UUID] | None = None,
    ) -> None:
        """Aplica acessos do usuário.

        - Sem `scope` (MASTER): substitui todos os acessos pelo payload.
        - Com `scope` (ADMIN): substitui apenas os acessos dos municípios
          dentro do escopo; acessos em municípios fora do escopo (que o
          ADMIN não gerencia) ficam intactos.
        """
        municipality_ids: set[UUID] = set()
        facilities: list[tuple[UUID, str, list[str]]] = []

        for mun in tree:
            municipality_ids.add(mun.municipality_id)
            for fac in mun.facilities:
                mods = [m.lower() for m in fac.modules if m.lower() in VALID_MODULES]
                facilities.append((fac.facility_id, fac.role, mods))

        # Preserva acessos fora do escopo quando ADMIN está editando
        if scope is not None:
            existing_muns = await self.repo.list_municipality_accesses(user_id)
            for ma in existing_muns:
                if ma.municipality_id not in scope:
                    municipality_ids.add(ma.municipality_id)

            existing_facs = await self.repo.list_facility_accesses(user_id)
            for fa, fac, _mun in existing_facs:
                if fac.municipality_id not in scope:
                    facilities.append((fa.facility_id, fa.role, list(fa.modules)))

        # Valida existência dos municípios/unidades referenciados
        if municipality_ids:
            existing = await self.session.scalars(
                select(Municipality.id).where(Municipality.id.in_(municipality_ids))
            )
            existing_set = set(existing.all())
            missing = municipality_ids - existing_set
            if missing:
                raise NotFoundError("Município informado não existe.")

        if facilities:
            fac_ids = [f[0] for f in facilities]
            fac_rows = await self.session.scalars(
                select(Facility).where(Facility.id.in_(fac_ids))
            )
            fac_list = list(fac_rows.all())
            fac_map = {f.id: f for f in fac_list}
            for fid, _role, _mods in facilities:
                if fid not in fac_map:
                    raise NotFoundError("Unidade informada não existe.")
                # Unidade precisa pertencer a um município vinculado
                if fac_map[fid].municipality_id not in municipality_ids:
                    raise ForbiddenError("Unidade não pertence aos municípios vinculados.")

        await self.repo.replace_accesses(user_id, municipality_ids, facilities)

    # ─── Admin: reset de senha ──────────────────────────────────────────────

    async def admin_reset_password(
        self, user_id: UUID, payload: AdminResetPasswordRequest
    ) -> AdminResetPasswordResponse:
        user = await self.get_or_404(user_id)
        new_plain = payload.new_password or _gen_provisional_password()
        user.password_hash = hash_password(new_plain)
        user.token_version += 1  # invalida tokens existentes
        await self.repo.update(user)
        return AdminResetPasswordResponse(
            message="Senha redefinida. Entregue a senha provisória ao usuário.",
            new_password=new_plain,
        )

    # ─── Admin: estatísticas ────────────────────────────────────────────────

    async def stats(self, *, scope: set[UUID] | None = None) -> dict[str, int]:
        from sqlalchemy import case, func

        from app.modules.tenants.models import MunicipalityAccess

        stmt = select(
            func.count().label("total"),
            func.sum(case((User.status == UserStatus.ATIVO, 1), else_=0)).label("ativo"),
            func.sum(case((User.status == UserStatus.INATIVO, 1), else_=0)).label("inativo"),
            func.sum(case((User.status == UserStatus.BLOQUEADO, 1), else_=0)).label("bloqueado"),
        ).select_from(User)

        if scope is not None:
            sub = (
                select(MunicipalityAccess.user_id)
                .where(MunicipalityAccess.municipality_id.in_(scope))
                .distinct()
            )
            stmt = stmt.where(User.id.in_(sub))

        row = (await self.session.execute(stmt)).one()
        return {
            "total":     int(row.total or 0),
            "ativo":     int(row.ativo or 0),
            "inativo":   int(row.inativo or 0),
            "bloqueado": int(row.bloqueado or 0),
        }

    # ─── Admin: ativar/bloquear ─────────────────────────────────────────────

    async def set_status(self, user_id: UUID, status: UserStatus) -> User:
        user = await self.get_or_404(user_id)
        user.status = status
        user.is_active = status != UserStatus.BLOQUEADO
        if status != UserStatus.ATIVO:
            user.token_version += 1
        await self.repo.update(user)
        return user
