"""Endpoints de usuário (próprio perfil + admin)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import DB, CurrentUserDep
from app.core.pagination import Page
from app.modules.users.models import User, UserStatus
from app.modules.users.schemas import (
    AdminResetPasswordRequest,
    AdminResetPasswordResponse,
    MessageResponse,
    UserCreate,
    UserDetail,
    UserListItem,
    UserListParams,
    UserRead,
    UserStats,
    UserUpdate,
    UserUpdateMe,
)
from app.modules.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


# ─── Self endpoints (/users/me) ───────────────────────────────────────────────


@router.get("/me", response_model=UserRead)
async def read_me(db: DB, user: CurrentUserDep) -> UserRead:
    record = await UserService(db).get_or_404(user.id)
    return UserRead.model_validate(record)


@router.patch("/me", response_model=UserRead)
async def update_me(payload: UserUpdateMe, db: DB, user: CurrentUserDep) -> UserRead:
    record = await UserService(db).update_me(user.id, payload)
    return UserRead.model_validate(record)


# ─── Admin endpoints ──────────────────────────────────────────────────────────


async def require_admin(db: DB, user: CurrentUserDep) -> User:
    """Guard: só superusuários gerenciam outros usuários (por ora)."""
    svc = UserService(db)
    record = await svc.get_or_404(user.id)
    if not record.is_superuser:
        raise HTTPException(status_code=403, detail="Apenas administradores podem gerenciar usuários.")
    return record


AdminDep = Annotated[User, Depends(require_admin)]


@router.get("/stats", response_model=UserStats)
async def stats(db: DB, _: AdminDep) -> UserStats:
    data = await UserService(db).stats()
    return UserStats(**data)


@router.get("", response_model=Page[UserListItem])
async def list_users(
    db: DB,
    _: AdminDep,
    search: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    module: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, alias="pageSize")] = 20,
) -> Page[UserListItem]:
    params = UserListParams(
        search=search,
        status=status_filter,  # type: ignore[arg-type]
        module=module,
        page=page,
        page_size=page_size,
    )
    return await UserService(db).list(params)


@router.post("", response_model=UserDetail, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: DB, _: AdminDep) -> UserDetail:
    svc = UserService(db)
    created = await svc.create(payload)
    return await svc.detail(created.id)


@router.get("/{user_id}", response_model=UserDetail)
async def get_user(user_id: UUID, db: DB, _: AdminDep) -> UserDetail:
    return await UserService(db).detail(user_id)


@router.patch("/{user_id}", response_model=UserDetail)
async def update_user(user_id: UUID, payload: UserUpdate, db: DB, _: AdminDep) -> UserDetail:
    svc = UserService(db)
    await svc.update(user_id, payload)
    return await svc.detail(user_id)


@router.post("/{user_id}/reset-password", response_model=AdminResetPasswordResponse)
async def admin_reset_password(
    user_id: UUID,
    payload: AdminResetPasswordRequest,
    db: DB,
    _: AdminDep,
) -> AdminResetPasswordResponse:
    return await UserService(db).admin_reset_password(user_id, payload)


@router.post("/{user_id}/activate", response_model=MessageResponse)
async def activate(user_id: UUID, db: DB, _: AdminDep) -> MessageResponse:
    await UserService(db).set_status(user_id, UserStatus.ATIVO)
    return MessageResponse(message="Usuário ativado.")


@router.post("/{user_id}/deactivate", response_model=MessageResponse)
async def deactivate(user_id: UUID, db: DB, _: AdminDep) -> MessageResponse:
    await UserService(db).set_status(user_id, UserStatus.INATIVO)
    return MessageResponse(message="Usuário inativado.")


@router.post("/{user_id}/block", response_model=MessageResponse)
async def block(user_id: UUID, db: DB, _: AdminDep) -> MessageResponse:
    await UserService(db).set_status(user_id, UserStatus.BLOQUEADO)
    return MessageResponse(message="Usuário bloqueado.")
