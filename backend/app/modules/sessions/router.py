"""Endpoints de sessões e presença."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.core.deps import DB, CurrentUserDep
from app.modules.sessions.models import SessionEndReason, UserSession
from app.modules.sessions.schemas import MessageResponse, PresenceItem, SessionRead
from app.modules.sessions.service import ONLINE_WINDOW_SECONDS, SessionService
from app.modules.users.models import User, UserLevel
from app.modules.users.router import require_admin
from app.modules.users.service import UserService

router = APIRouter(tags=["sessions"])


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _session_read(row: UserSession, user_name: str | None = None) -> SessionRead:
    now = datetime.now(UTC)
    end = row.ended_at or now
    duration = int((end - row.started_at).total_seconds())
    is_online = (
        row.ended_at is None
        and (now - row.last_seen_at).total_seconds() <= ONLINE_WINDOW_SECONDS
    )
    return SessionRead(
        id=row.id,
        user_id=row.user_id,
        user_name=user_name,
        started_at=row.started_at,
        last_seen_at=row.last_seen_at,
        ended_at=row.ended_at,
        end_reason=row.end_reason,
        ip=row.ip,
        user_agent=row.user_agent,
        is_active=row.ended_at is None,
        is_online=is_online,
        duration_seconds=max(0, duration),
    )


# ─── Minhas sessões ──────────────────────────────────────────────────────────


@router.get("/users/me/sessions", response_model=list[SessionRead])
async def my_sessions(
    db: DB, user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
) -> list[SessionRead]:
    rows = await SessionService(db).list_for_user(user.id, limit=limit)
    return [_session_read(r, user_name=user.name) for r in rows]


# ─── Sessões de um usuário (ADMIN/MASTER) ────────────────────────────────────


@router.get(
    "/users/{user_id}/sessions",
    response_model=list[SessionRead],
    dependencies=[Depends(require_admin)],
)
async def user_sessions(
    user_id: UUID, db: DB, user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
) -> list[SessionRead]:
    svc_users = UserService(db)
    # pega actor para ensure_target_in_scope
    from app.modules.users.models import User as UserModel
    actor = await db.scalar(select(UserModel).where(UserModel.id == user.id))
    if actor is None:
        raise HTTPException(401)
    await svc_users.ensure_target_in_scope(actor, user_id)

    target = await db.scalar(select(User).where(User.id == user_id))
    rows = await SessionService(db).list_for_user(user_id, limit=limit)
    return [_session_read(r, user_name=target.name if target else None) for r in rows]


# ─── Presença ────────────────────────────────────────────────────────────────


@router.get("/users/presence", response_model=list[PresenceItem])
async def presence(
    db: DB,
    user: CurrentUserDep,
    scope: Annotated[str | None, Query()] = None,  # 'actor' restringe ao escopo
) -> list[PresenceItem]:
    svc_users = UserService(db)
    actor = await db.scalar(select(User).where(User.id == user.id))
    if actor is None:
        raise HTTPException(401)
    scope_ids = None
    if scope == "actor" and actor.level != UserLevel.MASTER:
        scope_ids = await svc_users.actor_scope(actor)

    rows = await SessionService(db).presence(scope=scope_ids)
    return [
        PresenceItem(
            user_id=u.id,
            user_name=u.name,
            email=u.email,
            primary_role=u.primary_role,
            session_id=s.id,
            started_at=s.started_at,
            last_seen_at=s.last_seen_at,
            ip=s.ip,
        )
        for u, s in rows
    ]


# ─── Revogar sessão (ADMIN/MASTER) ───────────────────────────────────────────


@router.post(
    "/users/{user_id}/sessions/{session_id}/revoke",
    response_model=MessageResponse,
    dependencies=[Depends(require_admin)],
)
async def revoke_session(
    user_id: UUID, session_id: UUID, db: DB, user: CurrentUserDep,
) -> MessageResponse:
    from app.modules.users.models import User as UserModel
    actor = await db.scalar(select(UserModel).where(UserModel.id == user.id))
    if actor is None:
        raise HTTPException(401)
    await UserService(db).ensure_target_in_scope(actor, user_id)

    s = await db.scalar(select(UserSession).where(UserSession.id == session_id))
    if s is None or s.user_id != user_id:
        raise HTTPException(404, "Sessão não encontrada.")
    # Também revoga a família de refresh pra invalidar de fato
    from app.modules.auth.models import RefreshToken
    from sqlalchemy import update as sql_update
    await db.execute(
        sql_update(RefreshToken)
        .where(RefreshToken.family_id == s.family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await SessionService(db).end_by_family(s.family_id, SessionEndReason.REVOKED_BY_ADMIN)
    return MessageResponse(message="Sessão encerrada.")
