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
# intervalo é considerada "online agora". Padrão Slack/GitHub.
ONLINE_WINDOW_SECONDS = 120

# Throttle de writes no last_seen_at (evita UPDATE a cada request).
TOUCH_THROTTLE_SECONDS = 30


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

    async def touch(self, family_id: uuid.UUID, *, user_id: uuid.UUID | None = None) -> None:
        """Atualiza last_seen_at da sessão. Throttled a 1 write / 30s por sessão.

        Se `family_id` não existe (sessão perdida ou criada antes dessa feature),
        é best-effort: nada acontece.
        """
        key = f"session:touch:{family_id}"
        client = self._redis()
        try:
            # SET key NX EX 30: se já foi setado, não toca (throttle ativo).
            applied = await client.set(key, "1", nx=True, ex=TOUCH_THROTTLE_SECONDS)
        finally:
            try:
                await client.aclose()
            except Exception:
                pass
        if not applied:
            return

        now = datetime.now(UTC)
        await self.session.execute(
            update(UserSession)
            .where(UserSession.family_id == family_id, UserSession.ended_at.is_(None))
            .values(last_seen_at=now)
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
        """Retorna (User, Session) de quem está online agora.

        Se `scope` é dado (ADMIN), filtra por usuários que tenham
        municipality_access em algum município do escopo.
        """
        from app.modules.tenants.models import MunicipalityAccess

        cutoff = datetime.fromtimestamp(
            datetime.now(UTC).timestamp() - ONLINE_WINDOW_SECONDS, tz=UTC,
        )

        stmt = (
            select(User, UserSession)
            .join(UserSession, UserSession.user_id == User.id)
            .where(UserSession.ended_at.is_(None))
            .where(UserSession.last_seen_at >= cutoff)
            .order_by(desc(UserSession.last_seen_at))
        )
        if scope is not None:
            sub = (
                select(MunicipalityAccess.user_id)
                .where(MunicipalityAccess.municipality_id.in_(scope))
                .distinct()
            )
            stmt = stmt.where(User.id.in_(sub))
        rows = (await self.session.execute(stmt)).all()
        return [(r[0], r[1]) for r in rows]

    async def count_online(self, *, scope: set[uuid.UUID] | None = None) -> int:
        from app.modules.tenants.models import MunicipalityAccess

        cutoff = datetime.fromtimestamp(
            datetime.now(UTC).timestamp() - ONLINE_WINDOW_SECONDS, tz=UTC,
        )
        stmt = (
            select(func.count(func.distinct(UserSession.user_id)))
            .where(UserSession.ended_at.is_(None))
            .where(UserSession.last_seen_at >= cutoff)
        )
        if scope is not None:
            sub = (
                select(MunicipalityAccess.user_id)
                .where(MunicipalityAccess.municipality_id.in_(scope))
                .distinct()
            )
            stmt = stmt.where(UserSession.user_id.in_(sub))
        return int((await self.session.scalar(stmt)) or 0)

    async def revoke_by_id(self, session_id: uuid.UUID, reason: SessionEndReason) -> UserSession | None:
        s = await self.session.scalar(select(UserSession).where(UserSession.id == session_id))
        if s is None or s.ended_at is not None:
            return s
        s.ended_at = datetime.now(UTC)
        s.end_reason = reason.value
        await self.session.flush()
        return s
