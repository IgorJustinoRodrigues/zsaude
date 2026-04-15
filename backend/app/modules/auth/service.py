"""Serviço de autenticação."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import UnauthorizedError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.modules.auth.models import PasswordReset, RefreshToken
from app.modules.auth.repository import AuthRepository
from app.modules.auth.schemas import TokenPair
from app.modules.users.models import User, UserStatus
from app.modules.users.repository import UserRepository

log = get_logger(__name__)


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.repo = AuthRepository(session)

    # ── Login ───────────────────────────────────────────────────────────

    async def login(self, identifier: str, password: str, ip: str, ua: str) -> TokenPair:
        user = await self.users.get_by_login_or_email(identifier)
        valid = bool(user and user.is_active and verify_password(password, user.password_hash))

        await self.repo.record_login_attempt(identifier, ip, valid)

        if not valid or user is None:
            raise UnauthorizedError("Credenciais inválidas.")

        if user.status == UserStatus.BLOQUEADO:
            raise UnauthorizedError("Usuário bloqueado.")
        if user.status == UserStatus.INATIVO:
            raise UnauthorizedError("Usuário inativo.")

        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
            await self.users.update(user)

        return await self._issue_pair(user, ip, ua)

    # ── Refresh ─────────────────────────────────────────────────────────

    async def refresh(self, refresh_token: str, ip: str, ua: str) -> TokenPair:
        token_hash = hash_opaque_token(refresh_token)
        token = await self.repo.find_refresh(token_hash)

        if token is None:
            # token nunca existiu; nada a revogar
            raise UnauthorizedError("Refresh inválido.")

        now = datetime.now(UTC)
        if token.revoked_at is not None or token.replaced_by_id is not None:
            # Replay detectado: revoga a família inteira ANTES de lançar,
            # e commita para garantir persistência (a exception dispararia
            # rollback no get_db).
            log.warning(
                "refresh_replay_detected",
                user_id=str(token.user_id),
                family_id=str(token.family_id),
            )
            await self.repo.revoke_family(token.family_id)
            await self.session.commit()
            raise UnauthorizedError("Refresh reutilizado. Sessão encerrada por segurança.")

        if token.expires_at < now:
            raise UnauthorizedError("Refresh expirado.")

        user = await self.users.get_by_id(token.user_id)
        if user is None or not user.is_active or user.status != UserStatus.ATIVO:
            raise UnauthorizedError("Usuário inválido.")

        # Emite novo par na mesma família
        new_opaque = generate_opaque_token()
        new_hash = hash_opaque_token(new_opaque)
        new_token = RefreshToken(
            user_id=user.id,
            family_id=token.family_id,
            token_hash=new_hash,
            expires_at=now + timedelta(days=settings.jwt_refresh_ttl_days),
            user_agent=ua,
            ip=ip,
        )
        await self.repo.add_refresh(new_token)

        # Marca o antigo como substituído
        token.replaced_by_id = new_token.id
        token.revoked_at = now
        await self.session.flush()

        access = create_access_token(subject=str(user.id), token_version=user.token_version)
        return TokenPair(
            access_token=access,
            refresh_token=new_opaque,
            expires_in=settings.jwt_access_ttl_minutes * 60,
        )

    # ── Logout ──────────────────────────────────────────────────────────

    async def logout(self, refresh_token: str) -> None:
        token_hash = hash_opaque_token(refresh_token)
        token = await self.repo.find_refresh(token_hash)
        if token is not None:
            await self.repo.revoke_family(token.family_id)

    # ── Senha: forgot / reset / change ──────────────────────────────────

    async def forgot_password(self, email: str, ip: str) -> str | None:
        """Gera token de reset. Retorna o token plaintext (para envio por email).

        Sempre retorna None ou token sem revelar se o e-mail existe.
        """
        user = await self.users.get_by_login_or_email(email)
        if user is None or not user.is_active:
            return None
        plaintext = generate_opaque_token()
        pr = PasswordReset(
            user_id=user.id,
            token_hash=hash_opaque_token(plaintext),
            expires_at=datetime.now(UTC) + timedelta(minutes=settings.jwt_reset_ttl_minutes),
            ip=ip,
        )
        await self.repo.add_password_reset(pr)
        return plaintext

    async def reset_password(self, token: str, new_password: str) -> None:
        pr = await self.repo.find_password_reset(hash_opaque_token(token))
        now = datetime.now(UTC)
        if pr is None or pr.used_at is not None or pr.expires_at < now:
            raise UnauthorizedError("Token de reset inválido ou expirado.")
        user = await self.users.get_by_id(pr.user_id)
        if user is None:
            raise UnauthorizedError("Usuário não encontrado.")
        user.password_hash = hash_password(new_password)
        user.token_version += 1  # invalida access tokens existentes
        pr.used_at = now
        # Revoga todas as famílias de refresh desse usuário (logout total)
        await self.session.flush()

    async def change_password(self, user: User, current: str, new: str) -> None:
        if not verify_password(current, user.password_hash):
            raise UnauthorizedError("Senha atual incorreta.")
        user.password_hash = hash_password(new)
        user.token_version += 1
        await self.session.flush()

    # ── Helpers ────────────────────────────────────────────────────────

    async def _issue_pair(self, user: User, ip: str, ua: str) -> TokenPair:
        now = datetime.now(UTC)
        access = create_access_token(subject=str(user.id), token_version=user.token_version)
        refresh_plain = generate_opaque_token()
        refresh = RefreshToken(
            user_id=user.id,
            family_id=uuid.uuid4(),
            token_hash=hash_opaque_token(refresh_plain),
            expires_at=now + timedelta(days=settings.jwt_refresh_ttl_days),
            user_agent=ua,
            ip=ip,
        )
        await self.repo.add_refresh(refresh)
        return TokenPair(
            access_token=access,
            refresh_token=refresh_plain,
            expires_in=settings.jwt_access_ttl_minutes * 60,
        )
