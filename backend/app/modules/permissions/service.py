"""Resolução de permissões: herança + overrides + cache.

Regra de precedência (do mais fraco para o mais forte):
    role SYSTEM base  <  role filho  <  role neto  <  override do acesso

Cada role pode declarar ``granted=true`` (concede) ou ``granted=false`` (nega
explícito) em ``role_permissions``. A ausência de linha significa "herda do
pai". Default final = **deny**.

MASTER (``User.level == MASTER``) é tratado como super-usuário e recebe
``ResolvedPermissions(is_root=True)`` — passa em qualquer checagem.

Cache em Valkey com TTL curto (15 min). Invalidação explícita via
``invalidate_user()`` quando algo na cadeia muda (role, RP ou override).
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.permissions.registry import all_permissions
from app.modules.permissions.models import (
    CboAbility,
    FacilityAccessPermissionOverride,
    Role,
    RolePermission,
)
from app.modules.tenants.models import FacilityAccess
from app.modules.users.models import User, UserLevel

log = get_logger(__name__)

_CACHE_TTL = 900  # 15 min
# Inclui o role efetivo no cache porque o binding ativo pode sobrescrever
# o role do acesso — sem isso, perms de um binding vazariam pra outro.
_CACHE_KEY_FMT = "perms:{user_id}:{access_id}:{role_id}"


# ─── Wrapper ────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class ResolvedPermissions:
    """Resultado da resolução.

    - ``codes``: permissões de sistema concedidas pelo role/overrides.
    - ``abilities``: direitos clínicos derivados do CBO do binding ativo
      no work-context (vazio quando não há binding ativo).
    - ``is_root``: MASTER — passa todas as checagens, inclusive abilities.

    Ação clínica passa por dois gates:
        ``code in perms AND perms.has_ability(ability)``.
    """

    codes: frozenset[str]
    abilities: frozenset[str] = frozenset()
    is_root: bool = False

    def __contains__(self, code: str) -> bool:
        return self.is_root or code in self.codes

    def has_any(self, *codes: str) -> bool:
        if self.is_root:
            return True
        return any(c in self.codes for c in codes)

    def has_any_in_module(self, module: str) -> bool:
        if self.is_root:
            return True
        prefix = f"{module}."
        return any(c.startswith(prefix) for c in self.codes)

    def has_ability(self, ability: str) -> bool:
        """Verifica se o CBO ativo concede essa ability.

        MASTER passa em qualquer ability. Sem binding ativo, só passa
        abilities que o caller tenha explicitamente concedido via outra
        via (ex.: role também pode declarar ability por sobrescrita
        futura — hoje não).
        """
        if self.is_root:
            return True
        return ability in self.abilities

    def modules(self) -> frozenset[str]:
        """Módulos derivados das permissões concedidas.

        MASTER (is_root) retorna o catálogo completo — a camada acima filtra
        pelos módulos operacionais para o switcher de contexto.
        """
        if self.is_root:
            return _all_modules()
        return frozenset(c.split(".", 1)[0] for c in self.codes)

    def to_list(self) -> list[str]:
        if self.is_root:
            return ["*"]
        return sorted(self.codes)


def _all_modules() -> frozenset[str]:
    return frozenset(p.module for p in all_permissions())


# ─── Service ────────────────────────────────────────────────────────────────


class PermissionService:
    def __init__(self, db: AsyncSession, valkey: redis.Redis | None = None) -> None:
        self.db = db
        self.valkey = valkey

    # ── resolução ──────────────────────────────────────────────────────

    async def resolve(
        self,
        user_id: uuid.UUID,
        access_id: uuid.UUID | None,
        *,
        role_id_override: uuid.UUID | None = None,
        cbo_id: str | None = None,
    ) -> ResolvedPermissions:
        """Resolve permissões efetivas para o par (usuário, acesso).

        - MASTER → is_root=True (passa tudo, inclusive abilities).
        - Sem acesso ou acesso sem role_id → conjunto vazio.
        - ``role_id_override`` (opcional): substitui ``access.role_id``.
          Usado pelo work-context quando o binding ativo tem role próprio.
        - ``cbo_id`` (opcional): CBO do binding ativo — traz as abilities
          clínicas associadas (prescrever, liberar laudo, etc.). Sem CBO
          ativo, ``abilities`` vem vazio.
        """
        user = await self.db.get(User, user_id)
        if user is None or not user.is_active:
            return ResolvedPermissions(codes=frozenset())
        if user.level == UserLevel.MASTER:
            return ResolvedPermissions(codes=frozenset(), is_root=True)

        if access_id is None:
            return ResolvedPermissions(codes=frozenset())

        # ── Resolução do role efetivo ──────────────────────────────────
        access = await self.db.get(FacilityAccess, access_id)
        if access is None:
            return ResolvedPermissions(codes=frozenset())
        effective_role_id = role_id_override or access.role_id
        if effective_role_id is None:
            return ResolvedPermissions(codes=frozenset())

        # ── Cache ──────────────────────────────────────────────────────
        cache_key = _CACHE_KEY_FMT.format(
            user_id=user_id, access_id=access_id, role_id=effective_role_id,
        )
        if self.valkey is not None:
            try:
                cached = await self.valkey.get(cache_key)
            except Exception:  # noqa: BLE001
                cached = None
            if cached:
                try:
                    codes = frozenset(json.loads(cached))
                    abilities = await self._abilities_for(cbo_id)
                    return ResolvedPermissions(codes=codes, abilities=abilities)
                except Exception:  # noqa: BLE001
                    pass

        chain = await self._role_chain(effective_role_id)
        effective: dict[str, bool] = {}

        if chain:
            role_ids = [r.id for r in chain]
            rps = list(
                (await self.db.scalars(
                    select(RolePermission).where(RolePermission.role_id.in_(role_ids))
                )).all()
            )
            by_role: dict[uuid.UUID, dict[str, bool]] = {rid: {} for rid in role_ids}
            for rp in rps:
                by_role[rp.role_id][rp.permission_code] = rp.granted

            # Aplica do mais base para o mais específico.
            for role in reversed(chain):
                effective.update(by_role[role.id])

        # Overrides do acesso (venceu acima de role).
        overrides = list(
            (await self.db.scalars(
                select(FacilityAccessPermissionOverride).where(
                    FacilityAccessPermissionOverride.facility_access_id == access_id
                )
            )).all()
        )
        for ov in overrides:
            effective[ov.permission_code] = ov.granted

        codes = frozenset(code for code, granted in effective.items() if granted)

        # Abilities do CBO ativo (se o work-context selecionou um binding).
        abilities = await self._abilities_for(cbo_id)
        resolved = ResolvedPermissions(codes=codes, abilities=abilities)

        # Grava no cache (fire-and-forget — falha nunca quebra request).
        # Cache armazena só as codes; abilities dependem do CBO ativo e
        # são resolvidas sempre (custo: 1 query barata por context token).
        if self.valkey is not None:
            try:
                await self.valkey.setex(cache_key, _CACHE_TTL, json.dumps(sorted(codes)))
            except Exception:  # noqa: BLE001
                pass

        return resolved

    async def resolve_for_facility(
        self,
        user_id: uuid.UUID,
        facility_id: uuid.UUID,
        *,
        role_id_override: uuid.UUID | None = None,
        cbo_id: str | None = None,
    ) -> tuple[FacilityAccess | None, ResolvedPermissions]:
        """Conveniência: busca o FacilityAccess por (user, facility) e resolve.

        Aceita overrides vindos do binding ativo (quando o work-context
        tem ``bnd`` no token): ``role_id_override`` substitui o role do
        acesso; ``cbo_id`` traz as abilities clínicas do CBO.
        """
        access = await self.db.scalar(
            select(FacilityAccess).where(
                FacilityAccess.user_id == user_id,
                FacilityAccess.facility_id == facility_id,
            )
        )
        if access is None:
            return None, await self.resolve(user_id, None)
        return access, await self.resolve(
            user_id, access.id,
            role_id_override=role_id_override,
            cbo_id=cbo_id,
        )

    async def _abilities_for(self, cbo_id: str | None) -> frozenset[str]:
        """Abilities do CBO. Vazio quando ``cbo_id is None``."""
        if not cbo_id:
            return frozenset()
        rows = await self.db.scalars(
            select(CboAbility.ability_code).where(CboAbility.cbo_id == cbo_id)
        )
        return frozenset(rows.all())

    async def _role_chain(self, role_id: uuid.UUID) -> list[Role]:
        """Cadeia role → role.parent → ... (mais específico primeiro).

        Trunca em qualquer role archived ou ciclo. Profundidade máxima de
        segurança = 16 níveis.
        """
        chain: list[Role] = []
        current_id: uuid.UUID | None = role_id
        seen: set[uuid.UUID] = set()
        for _ in range(16):
            if current_id is None or current_id in seen:
                break
            role = await self.db.get(Role, current_id)
            if role is None or role.archived:
                break
            seen.add(current_id)
            chain.append(role)
            current_id = role.parent_id
        return chain

    # ── invalidação ────────────────────────────────────────────────────

    async def invalidate_user(self, user_id: uuid.UUID) -> None:
        """Limpa todas as entradas de cache desse usuário."""
        if self.valkey is None:
            return
        try:
            pattern = f"perms:{user_id}:*"
            cursor = 0
            while True:
                cursor, keys = await self.valkey.scan(cursor=cursor, match=pattern, count=200)
                if keys:
                    await self.valkey.delete(*keys)
                if cursor == 0:
                    break
        except Exception as e:  # noqa: BLE001
            log.warning("perm_cache_invalidate_failed", user_id=str(user_id), error=str(e))

    async def invalidate_access(self, user_id: uuid.UUID, access_id: uuid.UUID) -> None:
        """Limpa todas as entradas do mesmo acesso (todos role_ids)."""
        if self.valkey is None:
            return
        try:
            pattern = f"perms:{user_id}:{access_id}:*"
            cursor = 0
            while True:
                cursor, keys = await self.valkey.scan(cursor=cursor, match=pattern, count=200)
                if keys:
                    await self.valkey.delete(*keys)
                if cursor == 0:
                    break
        except Exception as e:  # noqa: BLE001
            log.warning("perm_cache_invalidate_failed", error=str(e))
