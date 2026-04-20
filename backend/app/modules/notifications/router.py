"""Endpoints da central de notificações do usuário logado."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import DB, CurrentUserDep
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import (
    MessageResponse,
    NotificationRead,
    UnreadCountResponse,
)
from app.modules.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _to_read(row: Notification) -> NotificationRead:
    return NotificationRead(
        id=row.id,
        type=row.type,
        category=row.category,
        title=row.title,
        message=row.message,
        data=row.data,
        read=row.read_at is not None,
        dismissed=row.dismissed_at is not None,
        created_at=row.created_at,
        read_at=row.read_at,
    )


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    db: DB,
    user: CurrentUserDep,
    only_unread: Annotated[bool, Query(alias="onlyUnread")] = False,
    category: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[NotificationRead]:
    rows = await NotificationService(db).list_for_user(
        user.id, only_unread=only_unread, category=category, limit=limit,
    )
    return [_to_read(r) for r in rows]


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(db: DB, user: CurrentUserDep) -> UnreadCountResponse:
    n = await NotificationService(db).count_unread(user.id)
    return UnreadCountResponse(count=n)


@router.patch("/{notification_id}/read", response_model=MessageResponse)
async def mark_read(
    notification_id: UUID, db: DB, user: CurrentUserDep,
) -> MessageResponse:
    ok = await NotificationService(db).mark_read(user.id, notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notificação não encontrada ou já lida.")
    return MessageResponse(message="Marcada como lida.")


@router.post("/read-all", response_model=MessageResponse)
async def mark_all_read(db: DB, user: CurrentUserDep) -> MessageResponse:
    n = await NotificationService(db).mark_all_read(user.id)
    return MessageResponse(message=f"{n} marcadas como lidas.")


@router.delete("/{notification_id}", status_code=204)
async def dismiss(
    notification_id: UUID, db: DB, user: CurrentUserDep,
) -> None:
    await NotificationService(db).dismiss(user.id, notification_id)
