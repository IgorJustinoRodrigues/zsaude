"""Endpoints de usuário."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUserDep
from app.modules.users.schemas import UserRead, UserUpdateMe
from app.modules.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_me(db: DB, user: CurrentUserDep) -> UserRead:
    record = await UserService(db).get_or_404(user.id)
    return UserRead.model_validate(record)


@router.patch("/me", response_model=UserRead, status_code=status.HTTP_200_OK)
async def update_me(payload: UserUpdateMe, db: DB, user: CurrentUserDep) -> UserRead:
    record = await UserService(db).update_me(user.id, payload)
    return UserRead.model_validate(record)
