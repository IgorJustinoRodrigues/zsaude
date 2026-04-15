"""Repositório de usuários."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        return await self.session.scalar(select(User).where(User.id == user_id))

    async def get_by_login_or_email(self, identifier: str) -> User | None:
        stmt = select(User).where(or_(User.login == identifier, User.email == identifier))
        return await self.session.scalar(stmt)

    async def update(self, user: User) -> User:
        await self.session.flush()
        return user
