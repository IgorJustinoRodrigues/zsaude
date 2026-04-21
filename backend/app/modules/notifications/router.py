"""Endpoints da central de notificações + broadcast admin."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.core.deps import DB, AdminOrMasterDep, CurrentUserDep
from app.modules.notifications.broadcast_service import BroadcastService
from app.modules.notifications.models import Notification, NotificationBroadcast
from app.modules.notifications.schemas import (
    BroadcastCreate,
    BroadcastDetail,
    BroadcastRead,
    BroadcastRecipient,
    MessageResponse,
    NotificationDetail,
    NotificationRead,
    UnreadCountResponse,
)
from app.modules.notifications.service import NotificationService
from app.modules.users.models import User

router = APIRouter(prefix="/notifications", tags=["notifications"])
admin_router = APIRouter(
    prefix="/admin/notifications", tags=["notifications-admin"],
)


def _to_read(row: Notification) -> NotificationRead:
    return NotificationRead(
        id=row.id,
        type=row.type,
        category=row.category,
        title=row.title,
        message=row.message,
        has_body=bool(row.body and row.body.strip()),
        has_action=bool(row.action_url),
        data=row.data,
        read=row.read_at is not None,
        dismissed=row.dismissed_at is not None,
        created_at=row.created_at,
        read_at=row.read_at,
    )


# ─── User-facing ─────────────────────────────────────────────────────────


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


@router.get("/{notification_id}", response_model=NotificationDetail)
async def get_notification_detail(
    notification_id: UUID, db: DB, user: CurrentUserDep,
) -> NotificationDetail:
    row = await NotificationService(db).get_for_user(user.id, notification_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Notificação não encontrada.")

    created_by_name: str | None = None
    scope_label: str | None = None
    if row.created_by_user_id:
        created_by_name = await db.scalar(
            select(User.name).where(User.id == row.created_by_user_id)
        )
    if row.broadcast_id:
        scope_label = await db.scalar(
            select(NotificationBroadcast.scope_label)
            .where(NotificationBroadcast.id == row.broadcast_id)
        )
    return NotificationDetail(
        id=row.id,
        type=row.type,
        category=row.category,
        title=row.title,
        message=row.message,
        body=row.body,
        action_url=row.action_url,
        action_label=row.action_label,
        data=row.data,
        read=row.read_at is not None,
        dismissed=row.dismissed_at is not None,
        created_at=row.created_at,
        read_at=row.read_at,
        created_by_name=created_by_name,
        scope_label=scope_label,
    )


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


# ─── Admin (MASTER/ADMIN): broadcast ─────────────────────────────────────


@admin_router.post("/broadcast", response_model=BroadcastRead, status_code=201)
async def create_broadcast(
    payload: BroadcastCreate,
    db: DB,
    actor: AdminOrMasterDep,
) -> BroadcastRead:
    actor_row = await db.scalar(select(User).where(User.id == actor.id))
    if actor_row is None:
        raise HTTPException(status_code=401)
    try:
        bcast = await BroadcastService(db).create_broadcast(
            actor=actor_row,
            scope_type=payload.scope_type,
            scope_id=payload.scope_id,
            type=payload.type,
            category=payload.category,
            title=payload.title,
            message=payload.message,
            body=payload.body,
            action_url=payload.action_url,
            action_label=payload.action_label,
        )
    except Exception as exc:
        # ForbiddenError / NotFoundError vão virar 403/404 pelo handler global.
        raise
    return BroadcastRead(
        id=bcast.id,
        scope_type=bcast.scope_type,
        scope_id=bcast.scope_id,
        scope_label=bcast.scope_label,
        type=bcast.type,
        category=bcast.category,
        title=bcast.title,
        message=bcast.message,
        total_recipients=bcast.total_recipients,
        read_count=0,
        created_at=bcast.created_at,
        created_by_name=actor_row.name,
    )


@admin_router.get("/broadcasts", response_model=list[BroadcastRead])
async def list_broadcasts(
    db: DB, actor: AdminOrMasterDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[BroadcastRead]:
    actor_row = await db.scalar(select(User).where(User.id == actor.id))
    if actor_row is None:
        raise HTTPException(status_code=401)
    rows = await BroadcastService(db).list_broadcasts(actor=actor_row, limit=limit)
    return [
        BroadcastRead(
            id=b.id,
            scope_type=b.scope_type,
            scope_id=b.scope_id,
            scope_label=b.scope_label,
            type=b.type,
            category=b.category,
            title=b.title,
            message=b.message,
            total_recipients=b.total_recipients,
            read_count=read_count,
            created_at=b.created_at,
            created_by_name=author_name,
        )
        for b, read_count, author_name in rows
    ]


@admin_router.get("/broadcasts/{broadcast_id}", response_model=BroadcastDetail)
async def broadcast_detail(
    broadcast_id: UUID, db: DB, actor: AdminOrMasterDep,
) -> BroadcastDetail:
    actor_row = await db.scalar(select(User).where(User.id == actor.id))
    if actor_row is None:
        raise HTTPException(status_code=401)
    b, read_count, author_name, recipients = await BroadcastService(db).get_broadcast_detail(
        actor=actor_row, broadcast_id=broadcast_id,
    )
    return BroadcastDetail(
        id=b.id,
        scope_type=b.scope_type,
        scope_id=b.scope_id,
        scope_label=b.scope_label,
        type=b.type,
        category=b.category,
        title=b.title,
        message=b.message,
        body=b.body,
        action_url=b.action_url,
        action_label=b.action_label,
        total_recipients=b.total_recipients,
        read_count=read_count,
        created_at=b.created_at,
        created_by_name=author_name,
        recipients=[
            BroadcastRecipient(user_id=u.id, user_name=u.name, read_at=r)
            for u, r in recipients
        ],
    )
