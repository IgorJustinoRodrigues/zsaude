"""Gestão de sessões de usuário."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import redis.asyncio as redis
from sqlalchemy import and_, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.sessions.models import SessionEndReason, UserSession
from app.modules.users.models import User

# Janela de presença: sessão sem ended_at e com last_seen_at dentro desse
# intervalo é considerada "online agora". Reduzida de 120s pra 30s pra
# que o status "offline" fique bem perto do tempo real em que o usuário
# fecha a aba ou perde conexão.
ONLINE_WINDOW_SECONDS = 30

# Throttle de writes no last_seen_at (evita UPDATE a cada request).
# Tem que ser **menor que a janela** senão um tick pode passar sem
# atualizar e a presence pisca offline. Com polling de 15s no front,
# 10s garante que todo tick passa pelo throttle.
TOUCH_THROTTLE_SECONDS = 10


class SessionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ─── Lifecycle ────────────────────────────────────────────────────

    async def start(
        self,
        *,
        user_id: uuid.UUID,
        family_id: uuid.UUID,
        ip: str,
        user_agent: str,
    ) -> UserSession:
        row = UserSession(
            user_id=user_id,
            family_id=family_id,
            ip=ip or "",
            user_agent=user_agent or "",
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def end_by_family(self, family_id: uuid.UUID, reason: SessionEndReason) -> None:
        now = datetime.now(UTC)
        await self.session.execute(
            update(UserSession)
            .where(UserSession.family_id == family_id, UserSession.ended_at.is_(None))
            .values(ended_at=now, end_reason=reason.value)
        )

    async def end_all_for_user(self, user_id: uuid.UUID, reason: SessionEndReason) -> int:
        now = datetime.now(UTC)
        res = await self.session.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.ended_at.is_(None))
            .values(ended_at=now, end_reason=reason.value)
        )
        return res.rowcount or 0

    # ─── Touch (atualização de last_seen_at) com throttle via Valkey ──

    @staticmethod
    def _redis() -> redis.Redis:
        return redis.from_url(settings.valkey_url, decode_responses=True)

    async def touch(
        self,
        family_id: uuid.UUID,
        *,
        user_id: uuid.UUID | None = None,
        municipality_id: uuid.UUID | None = None,
        facility_id: uuid.UUID | None = None,
    ) -> None:
        """Atualiza last_seen_at da sessão. Throttled a 1 write / 30s por sessão.

        Se ``municipality_id``/``facility_id`` vierem (request carrega
        X-Work-Context), atualiza também o contexto ATIVO da sessão —
        usado pra presence escopada: ``quem está online *neste município*``.

        Se ``family_id`` não existe (sessão perdida ou criada antes dessa
        feature), é best-effort: nada acontece.
        """
        key = f"session:touch:{family_id}"
        # O touch por si só é throttled a 30s, MAS quando o contexto
        # ativo muda (usuário trocou de município), precisamos atualizar
        # já — senão a presença fica desatualizada. Usamos uma key
        # separada que inclui o escopo e tem TTL mais curto.
        ctx_key = f"session:ctx:{family_id}:{municipality_id or '-'}:{facility_id or '-'}"
        client = self._redis()
        try:
            applied = await client.set(key, "1", nx=True, ex=TOUCH_THROTTLE_SECONDS)
            # Se não passou no throttle do last_seen, mas o contexto é novo
            # (ctx_key ainda não setado), ainda roda o UPDATE pra mexer
            # no active_municipality_id — mesmo sem tocar last_seen.
            ctx_changed = False
            if municipality_id is not None or facility_id is not None:
                ctx_changed = bool(
                    await client.set(ctx_key, "1", nx=True, ex=TOUCH_THROTTLE_SECONDS)
                )
        finally:
            try:
                await client.aclose()
            except Exception:
                pass
        if not applied and not ctx_changed:
            return

        now = datetime.now(UTC)
        values: dict = {"last_seen_at": now}
        if municipality_id is not None:
            values["active_municipality_id"] = municipality_id
        if facility_id is not None:
            values["active_facility_id"] = facility_id
        await self.session.execute(
            update(UserSession)
            .where(UserSession.family_id == family_id, UserSession.ended_at.is_(None))
            .values(**values)
        )
        await self.session.commit()

    # ─── Listagem ─────────────────────────────────────────────────────

    async def list_for_user(self, user_id: uuid.UUID, *, limit: int = 20) -> list[UserSession]:
        stmt = (
            select(UserSession)
            .where(UserSession.user_id == user_id)
            .order_by(desc(UserSession.started_at))
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())

    async def presence(self, *, scope: set[uuid.UUID] | None = None) -> list[tuple[User, UserSession]]:
        """Retorna (User, Session) de quem está online **agora**.

        Dedupe por ``(user_id, ip)``: múltiplas abas/sessões do mesmo
        usuário no mesmo IP contam como **um** login. IPs distintos do
        mesmo usuário ainda aparecem separados (útil pra notar acesso
        paralelo, ex.: desktop + celular).

        Se ``scope`` é dado, filtra por sessões cujo
        ``active_municipality_id`` está no escopo. MASTER é excluído da
        presença escopada.
        """
        from app.modules.users.models import UserLevel

        cutoff = datetime.fromtimestamp(
            datetime.now(UTC).timestamp() - ONLINE_WINDOW_SECONDS, tz=UTC,
        )

        # DISTINCT ON (user_id, ip) — pega a sessão mais recente de cada
        # combinação. Requer ORDER BY iniciando com as mesmas colunas.
        stmt = (
            select(User, UserSession)
            .join(UserSession, UserSession.user_id == User.id)
            .where(UserSession.ended_at.is_(None))
            .where(UserSession.last_seen_at >= cutoff)
            .distinct(UserSession.user_id, UserSession.ip)
            .order_by(
                UserSession.user_id,
                UserSession.ip,
                desc(UserSession.last_seen_at),
            )
        )
        if scope is not None:
            stmt = (
                stmt.where(UserSession.active_municipality_id.in_(scope))
                    .where(User.level != UserLevel.MASTER)
            )
        rows = (await self.session.execute(stmt)).all()
        # Reordena pelo ``last_seen_at`` desc pra exibição — a cláusula
        # DISTINCT ON exigiu outra ordem na SQL.
        tuples = [(r[0], r[1]) for r in rows]
        tuples.sort(key=lambda t: t[1].last_seen_at or t[1].started_at, reverse=True)
        return tuples

    async def count_online(self, *, scope: set[uuid.UUID] | None = None) -> int:
        """Conta "logins" ativos agora — tupla ``(user_id, ip)`` distinta.

        Regra: mesmo usuário no mesmo IP (várias abas, sessões reusadas)
        = 1 login. IPs diferentes do mesmo user contam separado (ex.:
        desktop + celular)."""
        from app.modules.users.models import UserLevel

        cutoff = datetime.fromtimestamp(
            datetime.now(UTC).timestamp() - ONLINE_WINDOW_SECONDS, tz=UTC,
        )
        # Subquery DISTINCT (user_id, ip) e depois COUNT das tuplas.
        subq = (
            select(UserSession.user_id, UserSession.ip)
            .where(UserSession.ended_at.is_(None))
            .where(UserSession.last_seen_at >= cutoff)
        )
        if scope is not None:
            subq = (
                subq.where(UserSession.active_municipality_id.in_(scope))
                    .where(UserSession.user_id.in_(
                        select(User.id).where(User.level != UserLevel.MASTER)
                    ))
            )
        subq = subq.distinct().subquery()
        stmt = select(func.count()).select_from(subq)
        return int((await self.session.scalar(stmt)) or 0)

    async def revoke_by_id(self, session_id: uuid.UUID, reason: SessionEndReason) -> UserSession | None:
        s = await self.session.scalar(select(UserSession).where(UserSession.id == session_id))
        if s is None or s.ended_at is not None:
            return s
        s.ended_at = datetime.now(UTC)
        s.end_reason = reason.value
        await self.session.flush()
        return s
