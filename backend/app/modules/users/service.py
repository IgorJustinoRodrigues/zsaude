"""Serviço de usuários."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.modules import OPERATIONAL_MODULES
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

# Módulos válidos — alias de `OPERATIONAL_MODULES` pra legibilidade local.
VALID_MODULES = OPERATIONAL_MODULES

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

    async def update_me(self, user_id: UUID, payload: UserUpdateMe) -> tuple[User, bool]:
        """Atualiza dados do próprio usuário.

        Troca de e-mail **não** substitui ``email`` direto — grava em
        ``pending_email``, mantém o atual válido pra login/comunicações
        e o router é quem dispara o e-mail de verificação. Retorna
        ``(user, email_change_requested)``.
        """
        from app.core.audit import get_audit_context
        from app.modules.audit.helpers import describe_change, diff_fields, snapshot_fields
        from app.modules.audit.writer import write_audit

        user = await self.get_or_404(user_id)
        before = snapshot_fields(
            user, ["name", "social_name", "phone", "email", "pending_email", "birth_date", "face_opt_in"]
        )

        if payload.name is not None:
            user.name = payload.name
        if payload.social_name is not None:
            user.social_name = payload.social_name
        if payload.phone is not None:
            user.phone = payload.phone
        if payload.birth_date is not None:
            user.birth_date = payload.birth_date
        if payload.face_opt_in is not None:
            user.face_opt_in = payload.face_opt_in

        email_change_requested = False
        # ``"email" in model_fields_set`` distingue "campo ausente" de
        # "campo enviado com null" — o segundo é o sinal de "remover".
        if "email" in payload.model_fields_set:
            new_email = payload.email  # pode ser None = "remover"
            if new_email is None:
                if user.email is None and user.pending_email is None:
                    pass  # já está vazio, nada a fazer
                else:
                    # Regra de negócio: CPF OU e-mail obrigatório.
                    if not user.cpf:
                        raise ConflictError(
                            "Não é possível remover o e-mail sem um CPF "
                            "cadastrado — o sistema exige ao menos um dos dois.",
                        )
                    user.email = None
                    user.pending_email = None
                    user.email_verified_at = None
            elif new_email == user.email:
                # Re-submissão do e-mail atual: cancela qualquer pending.
                user.pending_email = None
            elif new_email == user.pending_email:
                # Mesmo alvo pendente — nada a fazer (reenviar via endpoint
                # /verify-request se o link se perdeu).
                pass
            else:
                # Checagem de colisão: nenhum outro usuário pode ter esse
                # e-mail como ativo.
                other = await self.repo.get_by_email(new_email)
                if other and other.id != user.id:
                    raise ConflictError("E-mail já cadastrado para outro usuário.")
                user.pending_email = new_email
                email_change_requested = True
        await self.repo.update(user)

        after = snapshot_fields(
            user, ["name", "social_name", "phone", "email", "pending_email", "birth_date", "face_opt_in"]
        )
        changes = diff_fields(before, after)
        if changes:
            actor = get_audit_context().user_name or user.name
            await write_audit(
                self.session,
                module="users",
                action="user_self_update",
                severity="info",
                resource="User",
                resource_id=str(user.id),
                description=describe_change(
                    actor=actor, verb="atualizou os próprios dados",
                    changed_fields=[c.label for c in changes],
                ),
                details={"changes": [c.as_dict() for c in changes]},
            )
        return user, email_change_requested

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
                counts_by_user[fa.user_id] = (muns, facs + 1, mods)

            # Módulos agregados via CTE (considera herança do role).
            modules_by_user = await self.repo.bulk_modules_by_user(ids)
            # MASTER vê todos os módulos operacionais (super-usuário).
            for u in rows:
                mods_set = modules_by_user.get(u.id, set())
                if u.level == UserLevel.MASTER:
                    mods_set = set(OPERATIONAL_MODULES)
                muns, facs, _ = counts_by_user[u.id]
                counts_by_user[u.id] = (muns, facs, mods_set)

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
        from app.modules.permissions.models import Role
        from app.modules.permissions.service import PermissionService

        user = await self.get_or_404(user_id)
        fac_rows = await self.repo.list_facility_accesses(user_id)

        # Cache local de roles por id (evita N queries repetidas).
        role_ids = {fa.role_id for fa, _, _ in fac_rows if fa.role_id}
        roles_by_id: dict[UUID, Role] = {}
        if role_ids:
            r_rows = await self.session.scalars(select(Role).where(Role.id.in_(role_ids)))
            roles_by_id = {r.id: r for r in r_rows.all()}

        perm_svc = PermissionService(self.session)

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

            role = roles_by_id.get(fa.role_id)
            role_name = role.name if role else ""

            resolved = await perm_svc.resolve(user.id, fa.id)
            if resolved.is_root:
                mods = sorted(OPERATIONAL_MODULES)
            else:
                mods = sorted(resolved.modules() & OPERATIONAL_MODULES)

            by_mun[key]["facilities"].append(
                FacilityAccessDetail(
                    facility_access_id=fa.id,
                    facility_id=fac.id,
                    facility_name=fac.name,
                    facility_short_name=fac.short_name,
                    facility_type=fac.type.value if hasattr(fac.type, "value") else str(fac.type),
                    role_id=fa.role_id,
                    role=role_name,
                    modules=mods,
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

        # Pelo menos um entre CPF e e-mail é obrigatório — o schema já
        # rejeita payload sem nenhum dos dois, isso aqui é defesa em
        # profundidade.
        if not payload.cpf and not payload.email:
            raise ConflictError("Informe CPF ou e-mail.")

        # Colisão só é checada para o campo que foi informado.
        if payload.cpf and await self.repo.get_by_cpf(payload.cpf):
            raise ConflictError("CPF já está em uso.")
        if payload.email and await self.repo.get_by_email(payload.email):
            raise ConflictError("E-mail já está em uso.")

        # ``login`` é interno: preferimos CPF, senão e-mail (slug antes do @).
        login = payload.cpf or (payload.email or "").lower()
        if await self.repo.get_by_login(login):
            raise ConflictError("Identificador já está em uso.")

        status_enum = UserStatus(payload.status)
        level_enum = UserLevel(payload.level)
        user = User(
            login=login,
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

        # Snapshot dos campos para calcular diff (só o que mudou de fato).
        changes: dict[str, dict] = {}
        def _track(field: str, old, new) -> None:
            if old != new:
                changes[field] = {"from": old, "to": new}

        if payload.email is not None and payload.email != user.email:
            other = await self.repo.get_by_email(payload.email)
            if other and other.id != user.id:
                raise ConflictError("E-mail já cadastrado para outro usuário.")
            _track("email", user.email, payload.email)
            user.email = payload.email

        if payload.name is not None:
            _track("name", user.name, payload.name)
            user.name = payload.name
        if payload.phone is not None:
            _track("phone", user.phone, payload.phone)
            user.phone = payload.phone
        if payload.primary_role is not None:
            _track("primaryRole", user.primary_role, payload.primary_role)
            user.primary_role = payload.primary_role

        if payload.status is not None:
            new_status = UserStatus(payload.status)
            _track("status", user.status.value if hasattr(user.status, "value") else str(user.status), new_status.value)
            user.status = new_status
            user.is_active = new_status != UserStatus.BLOQUEADO
            if new_status != UserStatus.ATIVO:
                user.token_version += 1

        if payload.level is not None:
            new_level = UserLevel(payload.level)
            if user.level != new_level:
                from app.modules.sessions.models import SessionEndReason
                from app.modules.sessions.service import SessionService

                _track("level", user.level.value, new_level.value)
                user.level = new_level
                user.is_superuser = (new_level == UserLevel.MASTER)
                user.token_version += 1
                await SessionService(self.session).end_all_for_user(user_id, SessionEndReason.LEVEL_CHANGED)

        await self.repo.update(user)

        if payload.municipalities is not None:
            access_changes = await self._apply_accesses_with_diff(
                user.id, payload.municipalities, scope=scope,
            )
            if access_changes:
                changes["accesses"] = access_changes

        # Se alguma coisa mudou, grava um único audit log com o diff enxuto.
        if changes:
            from app.core.audit import get_audit_context
            from app.modules.audit.helpers import describe_change, humanize_field
            from app.modules.audit.writer import write_audit

            actor = get_audit_context().user_name
            field_labels = [humanize_field(k) for k in changes.keys()]
            await write_audit(
                self.session,
                module="users",
                action="user_update",
                severity="info",
                resource="User",
                resource_id=str(user.id),
                description=describe_change(
                    actor=actor,
                    verb="editou",
                    target_kind="usuário",
                    target_name=user.name,
                    changed_fields=field_labels,
                ),
                details={
                    "targetUserId": str(user.id),
                    "targetUserName": user.name,
                    "changes": changes,
                },
            )

        return user

    async def _apply_accesses_with_diff(
        self,
        user_id: UUID,
        tree: list,
        *,
        scope: set[UUID] | None = None,
    ) -> dict | None:
        """Retorna o diff de vínculos (antes × depois) com **nomes legíveis**.

        Inclui ``facilityName``, ``municipalityName`` e ``roleName`` para
        evitar UUIDs crus nos logs de auditoria.
        """
        # Estado antes.
        rows_before = await self.repo.list_facility_accesses(user_id)
        before: dict[UUID, UUID] = {fa.facility_id: fa.role_id for fa, _, _ in rows_before}
        fac_name_map: dict[UUID, str] = {
            fac.id: (fac.short_name or fac.name)
            for _, fac, _ in rows_before
        }
        mun_name_map: dict[UUID, tuple[str, str]] = {
            mun.id: (mun.name, mun.state)
            for _, fac, mun in rows_before
            for _ in [0]  # noqa — tupla
        }
        # mapa facility → município (para resolver depois)
        fac_to_mun: dict[UUID, UUID] = {fac.id: mun.id for _, fac, mun in rows_before}

        await self._apply_accesses(user_id, tree, scope=scope)

        rows_after = await self.repo.list_facility_accesses(user_id)
        after: dict[UUID, UUID] = {fa.facility_id: fa.role_id for fa, _, _ in rows_after}
        for _, fac, mun in rows_after:
            fac_name_map.setdefault(fac.id, fac.short_name or fac.name)
            mun_name_map.setdefault(mun.id, (mun.name, mun.state))
            fac_to_mun.setdefault(fac.id, mun.id)

        # Resolve nomes de roles envolvidos.
        role_ids = {rid for rid in {*before.values(), *after.values()} if rid is not None}
        role_name_map: dict[UUID, str] = {}
        if role_ids:
            from app.modules.permissions.models import Role

            r_rows = await self.session.scalars(select(Role).where(Role.id.in_(role_ids)))
            role_name_map = {r.id: r.name for r in r_rows.all()}

        def _fac_label(fid: UUID) -> dict[str, str]:
            mun_id = fac_to_mun.get(fid)
            mun_name, mun_state = mun_name_map.get(mun_id, ("", "")) if mun_id else ("", "")
            return {
                "facilityId":       str(fid),
                "facilityName":     fac_name_map.get(fid, ""),
                "municipalityName": f"{mun_name}/{mun_state}" if mun_name else "",
            }

        def _role_ref(rid: UUID) -> dict[str, str]:
            return {"roleId": str(rid), "roleName": role_name_map.get(rid, "")}

        added = [
            {**_fac_label(fid), **_role_ref(rid)}
            for fid, rid in after.items() if fid not in before
        ]
        removed = [_fac_label(fid) for fid in before.keys() if fid not in after]
        changed = [
            {
                **_fac_label(fid),
                "from": role_name_map.get(before[fid], str(before[fid])),
                "to":   role_name_map.get(after[fid],  str(after[fid])),
            }
            for fid in after if fid in before and before[fid] != after[fid]
        ]
        if not (added or removed or changed):
            return None
        result: dict = {}
        if added:   result["added"]   = added
        if removed: result["removed"] = removed
        if changed: result["changed"] = changed
        return result

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
        facilities: list[tuple[UUID, UUID]] = []  # (facility_id, role_id)

        for mun in tree:
            municipality_ids.add(mun.municipality_id)
            for fac in mun.facilities:
                facilities.append((fac.facility_id, fac.role_id))

        # Preserva acessos fora do escopo quando ADMIN está editando
        if scope is not None:
            existing_muns = await self.repo.list_municipality_accesses(user_id)
            for ma in existing_muns:
                if ma.municipality_id not in scope:
                    municipality_ids.add(ma.municipality_id)

            existing_facs = await self.repo.list_facility_accesses(user_id)
            for fa, fac, _mun in existing_facs:
                if fac.municipality_id not in scope:
                    facilities.append((fa.facility_id, fa.role_id))

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
            for fid, _role_id in facilities:
                if fid not in fac_map:
                    raise NotFoundError("Unidade informada não existe.")
                # Unidade precisa pertencer a um município vinculado
                if fac_map[fid].municipality_id not in municipality_ids:
                    raise ForbiddenError("Unidade não pertence aos municípios vinculados.")

        # Valida role_ids (todos precisam existir e ter escopo compatível).
        if facilities:
            from app.modules.permissions.models import Role, RoleScope

            role_ids_needed = {rid for _, rid in facilities}
            r_rows = await self.session.scalars(select(Role).where(Role.id.in_(role_ids_needed)))
            role_map = {r.id: r for r in r_rows.all()}
            missing = role_ids_needed - set(role_map.keys())
            if missing:
                raise NotFoundError("Perfil informado não existe.")
            for fid, rid in facilities:
                role = role_map[rid]
                # MUNICIPALITY role precisa ser do mesmo município da unidade.
                if (
                    role.scope == RoleScope.MUNICIPALITY
                    and role.municipality_id != fac_map[fid].municipality_id
                ):
                    raise ForbiddenError("Perfil não pertence ao município da unidade.")

        await self.repo.replace_accesses(user_id, municipality_ids, facilities)

    # ─── Admin: reset de senha ──────────────────────────────────────────────

    async def admin_reset_password(
        self, user_id: UUID, payload: AdminResetPasswordRequest
    ) -> AdminResetPasswordResponse:
        from app.modules.auth.password_policy import (
            PasswordReuseError, apply_new_password,
        )

        user = await self.get_or_404(user_id)
        # Admin pode gerar uma senha provisória ou enviar uma explicitamente.
        # A cada tentativa que colide com histórico, geramos outra (até 5x).
        provided = payload.new_password
        for _ in range(5):
            candidate = provided or _gen_provisional_password()
            try:
                # require_change=True: senha é provisória; usuário vai
                # precisar trocar antes de navegar no sistema.
                await apply_new_password(
                    self.session, user, candidate, require_change=True,
                )
                new_plain = candidate
                break
            except PasswordReuseError:
                # Se o admin forneceu explicitamente, propaga o erro — não
                # devemos adivinhar outra senha por ele.
                if provided is not None:
                    raise ConflictError(
                        "Nova senha não pode ser igual a uma das senhas anteriores.",
                    )
                # Senão, gera outra automática e tenta de novo.
                continue
        else:
            raise ConflictError(
                "Não foi possível gerar uma senha provisória única. Tente de novo.",
            )
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
        from app.modules.sessions.models import SessionEndReason
        from app.modules.sessions.service import SessionService

        user = await self.get_or_404(user_id)
        user.status = status
        user.is_active = status != UserStatus.BLOQUEADO
        if status != UserStatus.ATIVO:
            user.token_version += 1
            reason = (
                SessionEndReason.USER_BLOCKED
                if status == UserStatus.BLOQUEADO
                else SessionEndReason.USER_DEACTIVATED
            )
            await SessionService(self.session).end_all_for_user(user_id, reason)
        await self.repo.update(user)
        return user


    # ─── Aniversário + estatísticas ──────────────────────────────────────

    async def anniversary(self, user: User) -> dict:
        """Calcula ``is_birthday`` + estatísticas de uso do último ano.

        Métricas agregadas a partir de ``audit_logs`` (apenas ações do
        próprio usuário). Quando o usuário não tem ``birth_date`` cadastrado
        ou a data não bate com hoje, ``is_birthday=False`` — o frontend
        usa isso pra decidir se mostra o modal comemorativo.
        """
        from datetime import UTC, date, datetime, timedelta

        from sqlalchemy import and_, func, select as sa_select

        from app.modules.audit.models import AuditLog

        today = date.today()
        is_birthday = (
            user.birth_date is not None
            and user.birth_date.month == today.month
            and user.birth_date.day == today.day
        )
        age = None
        if user.birth_date is not None:
            age = today.year - user.birth_date.year
            # Corrige se aniversário ainda não passou neste ano.
            if (today.month, today.day) < (user.birth_date.month, user.birth_date.day):
                age -= 1

        since = datetime.now(UTC) - timedelta(days=365)
        base_where = and_(
            AuditLog.user_id == user.id,
            AuditLog.at >= since,
        )

        total_actions = int(
            await self.session.scalar(
                sa_select(func.count()).select_from(AuditLog).where(base_where)
            ) or 0
        )
        days_active = int(
            await self.session.scalar(
                sa_select(func.count(func.distinct(func.date(AuditLog.at))))
                .where(base_where)
            ) or 0
        )
        logins = int(
            await self.session.scalar(
                sa_select(func.count()).select_from(AuditLog)
                .where(base_where)
                .where(AuditLog.action == "login")
            ) or 0
        )
        patients_touched = int(
            await self.session.scalar(
                sa_select(func.count(func.distinct(AuditLog.resource_id)))
                .where(base_where)
                .where(AuditLog.resource == "patient")
            ) or 0
        )

        # Módulo mais usado
        mod_row = (
            await self.session.execute(
                sa_select(AuditLog.module, func.count().label("n"))
                .where(base_where)
                .group_by(AuditLog.module)
                .order_by(func.count().desc())
                .limit(1)
            )
        ).first()
        most_used_module = mod_row[0] if mod_row else None
        most_used_module_count = int(mod_row[1]) if mod_row else 0

        # social_name pode vir com espaço em branco (server_default=" ").
        display = (user.social_name or "").strip() or user.name or ""
        first_name = display.split(" ")[0] if display else ""

        return {
            "is_birthday": is_birthday,
            "first_name": first_name,
            "age": age if is_birthday else None,
            "stats": {
                "total_actions": total_actions,
                "days_active": days_active,
                "logins": logins,
                "patients_touched": patients_touched,
                "most_used_module": most_used_module,
                "most_used_module_count": most_used_module_count,
            },
        }


    # ─── Aniversariantes (listagem mensal) ────────────────────────────────

    async def birthdays(
        self, month: int, *, scope: set[UUID] | None = None,
    ) -> list[dict]:
        """Retorna usuários cujo ``birth_date`` cai no mês informado.

        Ordenado pelo dia do aniversário (ascendente). Inclui ``isToday``
        pro frontend destacar. Idade é a que a pessoa completa **neste ano**.

        ``scope`` opcional restringe aos usuários com MunicipalityAccess
        em algum dos municípios informados (usado em /ops pra listar só
        aniversariantes do município ativo). ``None`` = todos.
        """
        from datetime import date
        from sqlalchemy import extract, func as sa_func

        today = date.today()
        stmt = (
            select(User)
            .where(User.birth_date.is_not(None))
            .where(extract("month", User.birth_date) == month)
            .where(User.is_active.is_(True))
            .order_by(
                sa_func.extract("day", User.birth_date).asc(),
                User.name.asc(),
            )
        )
        if scope:
            from app.modules.tenants.models import MunicipalityAccess
            stmt = stmt.where(
                User.id.in_(
                    select(MunicipalityAccess.user_id)
                    .where(MunicipalityAccess.municipality_id.in_(scope))
                )
            )
        users = list((await self.session.scalars(stmt)).all())
        out = []
        for u in users:
            bd = u.birth_date
            if bd is None:
                continue
            is_today = bd.month == today.month and bd.day == today.day
            age_this_year = today.year - bd.year
            out.append({
                "id": u.id,
                "name": u.name,
                "social_name": (u.social_name or "").strip(),
                "level": u.level.value if hasattr(u.level, "value") else str(u.level),
                "primary_role": u.primary_role,
                "birth_date": bd,
                "day": bd.day,
                "month": bd.month,
                "is_today": is_today,
                "age": age_this_year,
            })
        return out
