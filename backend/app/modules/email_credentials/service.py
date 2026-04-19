"""Resolução e CRUD das credenciais de e-mail por escopo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.email import (
    EmailService,
    NullEmailService,
    SesEmailService,
    SmtpEmailService,
)
from app.core.logging import get_logger
from app.modules.email_credentials.models import (
    SYSTEM_SCOPE_ID,
    CredentialsScope,
    EmailCredentials,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)


@dataclass(slots=True)
class ResolvedCredentials:
    """Configuração efetiva pra um envio.

    ``source`` indica onde veio (``facility`` | ``municipality`` | ``system``
    | ``env``). Útil pra debug/auditoria.
    """

    backend: str          # 'ses' | 'smtp' | 'null'
    from_email: str
    from_name: str
    aws_region: str
    aws_access_key_id: str
    aws_secret_access_key: str
    ses_configuration_set: str
    source: str


class EmailCredentialsService:
    def __init__(self, session: "AsyncSession") -> None:
        self.session = session

    # ── CRUD ────────────────────────────────────────────────────────────

    async def get(
        self, scope_type: CredentialsScope, scope_id: UUID,
    ) -> EmailCredentials | None:
        return await self.session.scalar(
            select(EmailCredentials).where(
                EmailCredentials.scope_type == scope_type,
                EmailCredentials.scope_id == scope_id,
            )
        )

    async def upsert(
        self,
        scope_type: CredentialsScope,
        scope_id: UUID,
        *,
        from_email: str,
        from_name: str,
        aws_region: str,
        aws_access_key_id: str,
        aws_secret_access_key: str | None,  # None = manter a atual
        ses_configuration_set: str | None,
        is_active: bool,
    ) -> EmailCredentials:
        existing = await self.get(scope_type, scope_id)
        if existing is not None:
            existing.from_email = from_email
            existing.from_name = from_name
            existing.aws_region = aws_region
            existing.aws_access_key_id = aws_access_key_id
            if aws_secret_access_key is not None:
                existing.aws_secret_access_key_enc = encrypt_secret(aws_secret_access_key)
            existing.ses_configuration_set = ses_configuration_set
            existing.is_active = is_active
            await self.session.flush()
            return existing
        if aws_secret_access_key is None:
            # Primeira gravação exige secret.
            raise ValueError("awsSecretAccessKey é obrigatório na criação.")
        row = EmailCredentials(
            scope_type=scope_type,
            scope_id=scope_id,
            from_email=from_email,
            from_name=from_name,
            aws_region=aws_region,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key_enc=encrypt_secret(aws_secret_access_key),
            ses_configuration_set=ses_configuration_set,
            is_active=is_active,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def delete(
        self, scope_type: CredentialsScope, scope_id: UUID,
    ) -> bool:
        row = await self.get(scope_type, scope_id)
        if row is None:
            return False
        await self.session.delete(row)
        await self.session.flush()
        return True

    # ── Resolução (cascata) ──────────────────────────────────────────────

    async def resolve(
        self,
        *,
        municipality_id: UUID | None = None,
        facility_id: UUID | None = None,
    ) -> ResolvedCredentials:
        candidates: list[tuple[CredentialsScope, UUID, str]] = []
        if facility_id is not None:
            candidates.append((CredentialsScope.FACILITY, facility_id, "facility"))
        if municipality_id is not None:
            candidates.append((CredentialsScope.MUNICIPALITY, municipality_id, "municipality"))
        candidates.append((CredentialsScope.SYSTEM, SYSTEM_SCOPE_ID, "system"))

        for st, sid, src in candidates:
            row = await self.session.scalar(
                select(EmailCredentials).where(
                    EmailCredentials.scope_type == st,
                    EmailCredentials.scope_id == sid,
                    EmailCredentials.is_active.is_(True),
                )
            )
            if row is not None:
                return ResolvedCredentials(
                    backend="ses",
                    from_email=row.from_email,
                    from_name=(row.from_name or "").strip() or settings.email_from_name,
                    aws_region=row.aws_region,
                    aws_access_key_id=row.aws_access_key_id,
                    aws_secret_access_key=decrypt_secret(row.aws_secret_access_key_enc),
                    ses_configuration_set=row.ses_configuration_set or "",
                    source=src,
                )

        # Fallback final: env vars (settings). Preserva compat com instalações
        # que ainda não configuraram nada via UI.
        return ResolvedCredentials(
            backend=settings.email_backend,
            from_email=settings.email_from,
            from_name=settings.email_from_name,
            aws_region=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            ses_configuration_set=settings.ses_configuration_set,
            source="env",
        )

    # ── Factory de EmailService conforme creds resolvidas ───────────────

    def build_email_service(self, creds: ResolvedCredentials) -> EmailService:
        if creds.backend == "null":
            return NullEmailService()
        if creds.backend == "ses":
            return SesEmailService(
                region=creds.aws_region,
                access_key=creds.aws_access_key_id,
                secret_key=creds.aws_secret_access_key,
                configuration_set=creds.ses_configuration_set,
            )
        # smtp — não controlado via banco ainda; usa settings direto.
        return SmtpEmailService(
            host=settings.smtp_host,
            port=settings.smtp_port,
            user=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=settings.smtp_use_tls,
        )
