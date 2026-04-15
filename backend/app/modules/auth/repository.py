"""Repositório de auth: refresh tokens, password resets, login attempts."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import LoginAttempt, PasswordReset, RefreshToken


class AuthRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Refresh tokens ─────────────────────────────────────────────────

    async def add_refresh(self, token: RefreshToken) -> RefreshToken:
        self.session.add(token)
        await self.session.flush()
        return token

    async def find_refresh(self, token_hash: str) -> RefreshToken | None:
        return await self.session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )

    async def revoke_family(self, family_id: uuid.UUID) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    # ── Password reset ─────────────────────────────────────────────────

    async def add_password_reset(self, pr: PasswordReset) -> PasswordReset:
        self.session.add(pr)
        await self.session.flush()
        return pr

    async def find_password_reset(self, token_hash: str) -> PasswordReset | None:
        return await self.session.scalar(
            select(PasswordReset).where(PasswordReset.token_hash == token_hash)
        )

    # ── Login attempts (auditoria básica) ─────────────────────────────

    async def record_login_attempt(self, identifier: str, ip: str, success: bool) -> None:
        self.session.add(LoginAttempt(identifier=identifier, ip=ip, success=success))
        await self.session.flush()
