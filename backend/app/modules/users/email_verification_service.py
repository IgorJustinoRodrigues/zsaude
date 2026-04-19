"""Fluxo de verificação de e-mail.

Regras:

- Pedido de verificação gera um token opaco de 48 bytes (``secrets.token_urlsafe``),
  guarda SHA-256 na tabela ``email_verifications`` com ``email_target``
  fixado (se o usuário mudar o e-mail depois, o link antigo não vira
  válido pra nova caixa).
- Confirmação: valida hash + expiração + ``used_at IS NULL``. Se o
  ``email_target`` bater com ``user.pending_email``, promove pra
  ``user.email``. Em qualquer caso, preenche ``email_verified_at``.
- Mudança de e-mail: service ``invalidate_on_email_change`` seta
  ``pending_email``, zera ``email_verified_at`` e dispara nova verificação.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.core.email import EmailMessage, EmailService
from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from app.core.logging import get_logger
from app.core.security import generate_opaque_token, hash_opaque_token
from app.modules.auth.models import EmailVerification
from app.modules.email_templates.service import EmailTemplateService
from app.modules.users.models import User

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)


@dataclass(slots=True)
class VerificationRequestResult:
    email_target: str
    expires_at: datetime


class EmailVerificationService:
    def __init__(
        self,
        session: "AsyncSession",
        email_service: EmailService,
    ) -> None:
        self.session = session
        self.email_service = email_service

    # ── Helpers internos ─────────────────────────────────────────────────

    def _target_email_for(self, user: User) -> str:
        """Qual e-mail o link vai verificar agora."""
        return user.pending_email or user.email or ""

    def _build_link(self, plaintext: str) -> str:
        return f"{settings.app_public_url.rstrip('/')}/verificar-email?token={plaintext}"

    async def _send(
        self, user: User, target_email: str, plaintext: str, expires_at: datetime,
    ) -> None:
        ctx = {
            "app_name": settings.email_from_name,
            "user_name": user.name or "",
            "verify_link": self._build_link(plaintext),
            "expires_in_hours": settings.email_verification_ttl_hours,
        }
        rendered = await EmailTemplateService(self.session).render(
            "email_verification", ctx,
        )
        await self.email_service.send(
            EmailMessage(
                to=[target_email],
                subject=rendered.subject,
                html=rendered.html,
                text=rendered.text,
                from_name=rendered.from_name,
                tags={"category": "email_verification"},
            )
        )
        log.info(
            "email_verification_sent",
            user_id=str(user.id),
            target=target_email,
            expires_at=expires_at.isoformat(),
        )

    # ── API pública ──────────────────────────────────────────────────────

    async def request(self, user_id: UUID, ip: str) -> VerificationRequestResult:
        """Emite um token de verificação para o e-mail corrente do usuário.

        Se ``pending_email`` estiver preenchido (troca em andamento), usa
        ele como ``email_target``. Caso contrário, usa ``email``.
        """
        user = await self.session.scalar(select(User).where(User.id == user_id))
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        target = self._target_email_for(user)
        if not target:
            raise ConflictError("Usuário não possui e-mail cadastrado.")

        plaintext = generate_opaque_token()
        expires_at = datetime.now(UTC) + timedelta(
            hours=settings.email_verification_ttl_hours,
        )
        row = EmailVerification(
            user_id=user.id,
            email_target=target,
            token_hash=hash_opaque_token(plaintext),
            expires_at=expires_at,
            ip=ip,
        )
        self.session.add(row)
        await self.session.flush()

        await self._send(user, target, plaintext, expires_at)
        return VerificationRequestResult(email_target=target, expires_at=expires_at)

    async def confirm(self, plaintext: str) -> User:
        """Valida token + marca como verificado.

        Retorna o usuário dono do token. Token consumido não volta.
        """
        row = await self.session.scalar(
            select(EmailVerification).where(
                EmailVerification.token_hash == hash_opaque_token(plaintext),
            )
        )
        now = datetime.now(UTC)
        if row is None or row.used_at is not None or row.expires_at < now:
            raise UnauthorizedError("Link de verificação inválido ou expirado.")

        user = await self.session.scalar(select(User).where(User.id == row.user_id))
        if user is None:
            raise UnauthorizedError("Usuário não encontrado.")

        # Promove pending_email → email, se era troca.
        if user.pending_email and row.email_target == user.pending_email:
            # Check de colisão: outro usuário tomou esse endereço desde o pedido?
            other = await self.session.scalar(
                select(User).where(
                    User.email == user.pending_email, User.id != user.id,
                )
            )
            if other is not None:
                raise ConflictError("Esse e-mail já está em uso por outra conta.")
            user.email = user.pending_email
            user.pending_email = None

        user.email_verified_at = now
        row.used_at = now
        await self.session.flush()
        log.info("email_verification_confirmed", user_id=str(user.id), email=user.email)
        return user

    async def invalidate_on_email_change(self, user: User, new_email: str) -> None:
        """Chame isso quando o e-mail do usuário for alterado.

        - Grava o novo endereço em ``pending_email`` (o atual segue válido
          até a confirmação).
        - Zera ``email_verified_at`` (o atual precisa ser re-verificado,
          ou pode virar "Não verificado" se desejar estrito).
        - Emite nova verificação pro ``new_email``.

        OBS: essa função **não** chama ``flush`` — o caller cuida do commit.
        """
        user.pending_email = new_email
        # Mantém email_verified_at do e-mail antigo até o novo virar o ativo,
        # mas poderíamos zerar se quiséssemos que trocar = perder status.
        # Decisão: zera — evita mandar parabéns no e-mail antigo enquanto
        # o novo não vira ativo.
        user.email_verified_at = None
