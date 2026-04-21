"""Serviço da central de notificações.

API principal:

    svc = NotificationService(db)
    await svc.notify(
        user_id=...,
        type="warning",
        category="cnes_unbound",
        title="Sem vínculo CNES",
        message="...",
        data={"facility_id": "..."},
        dedup_key=f"cnes_unbound:{user_id}:{facility_id}",
    )
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import and_, desc, func, or_, select, update

from app.modules.notifications.models import Notification, NotificationBroadcast

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class NotificationService:
    def __init__(self, session: "AsyncSession") -> None:
        self.session = session

    # ── Criação ───────────────────────────────────────────────────────────

    async def notify(
        self,
        *,
        user_id: UUID,
        type: str,              # 'info' | 'success' | 'warning' | 'error'
        category: str,
        title: str,
        message: str,
        body: str | None = None,
        action_url: str | None = None,
        action_label: str | None = None,
        data: dict | None = None,
        dedup_key: str | None = None,
        created_by_user_id: UUID | None = None,
        broadcast_id: UUID | None = None,
    ) -> Notification | None:
        """Cria uma notificação. Retorna None se já havia uma idêntica
        (mesmo ``dedup_key``) não lida pro mesmo user."""
        if dedup_key:
            existing = await self.session.scalar(
                select(Notification).where(
                    Notification.user_id == user_id,
                    Notification.dedup_key == dedup_key,
                    Notification.read_at.is_(None),
                    Notification.dismissed_at.is_(None),
                )
            )
            if existing is not None:
                return None  # já tem uma pendente com a mesma chave
        row = Notification(
            user_id=user_id,
            type=type,
            category=category,
            title=title,
            message=message,
            body=body,
            action_url=action_url,
            action_label=action_label,
            data=data,
            dedup_key=dedup_key,
            created_by_user_id=created_by_user_id,
            broadcast_id=broadcast_id,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def get_for_user(
        self, user_id: UUID, notification_id: UUID,
    ) -> Notification | None:
        return await self.session.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )

    # ── Consulta ──────────────────────────────────────────────────────────

    async def list_for_user(
        self,
        user_id: UUID,
        *,
        only_unread: bool = False,
        include_dismissed: bool = False,
        category: str | None = None,
        limit: int = 50,
    ) -> list[Notification]:
        stmt = (
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(desc(Notification.created_at))
            .limit(limit)
        )
        if only_unread:
            stmt = stmt.where(Notification.read_at.is_(None))
        if not include_dismissed:
            stmt = stmt.where(Notification.dismissed_at.is_(None))
        if category:
            stmt = stmt.where(Notification.category == category)
        rows = await self.session.scalars(stmt)
        return list(rows.all())

    async def count_unread(self, user_id: UUID) -> int:
        n = await self.session.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
                Notification.dismissed_at.is_(None),
            )
        )
        return int(n or 0)

    # ── Mutações ──────────────────────────────────────────────────────────

    async def mark_read(
        self, user_id: UUID, notification_id: UUID,
    ) -> bool:
        now = datetime.now(UTC)
        res = await self.session.execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
            )
            .values(read_at=now)
        )
        return (res.rowcount or 0) > 0

    async def mark_all_read(self, user_id: UUID) -> int:
        now = datetime.now(UTC)
        res = await self.session.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
                Notification.dismissed_at.is_(None),
            )
            .values(read_at=now)
        )
        return res.rowcount or 0

    async def dismiss(self, user_id: UUID, notification_id: UUID) -> bool:
        now = datetime.now(UTC)
        res = await self.session.execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
                Notification.dismissed_at.is_(None),
            )
            .values(
                dismissed_at=now,
                # dismissed implica lido — simplifica o count_unread.
                read_at=func.coalesce(Notification.read_at, now),
            )
        )
        return (res.rowcount or 0) > 0
