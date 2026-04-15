"""Serviço de usuários."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserUpdateMe


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = UserRepository(session)

    async def get_or_404(self, user_id: UUID) -> User:
        user = await self.repo.get_by_id(user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        return user

    async def update_me(self, user_id: UUID, payload: UserUpdateMe) -> User:
        user = await self.get_or_404(user_id)
        if payload.name is not None:
            user.name = payload.name
        if payload.phone is not None:
            user.phone = payload.phone
        if payload.email is not None:
            user.email = payload.email
        await self.repo.update(user)
        return user
