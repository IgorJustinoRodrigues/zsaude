"""Despachante de e-mails — une template + envio + log + idempotência.

Ponta única que features devem usar:

    dispatcher = EmailDispatcher(session, email_service)
    await dispatcher.send(
        code="password_reset",
        to="user@example.com",
        context={...},
        user_id=user.id,                 # opcional
        municipality_id=mun.id,          # opcional, define o escopo do template
        idempotency_key="reset:xyz",     # opcional — evita reenvio
    )

Isso: (1) resolve o template via cascata SYSTEM→MUN→FAC, (2) manda via
``EmailService`` configurado, (3) grava em ``email_send_log`` o resultado.
Se ``idempotency_key`` já existe na tabela, pula o envio e retorna
status=skipped — o chamador pode decidir o que fazer com isso.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.core.email import EmailMessage, EmailService
from app.core.logging import get_logger
from app.modules.email_templates.log_model import EmailSendLog
from app.modules.email_templates.service import EmailTemplateService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)


@dataclass(slots=True)
class DispatchResult:
    status: str         # 'sent' | 'failed' | 'skipped'
    message_id: str
    log_id: UUID | None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "sent"


class EmailDispatcher:
    def __init__(
        self, session: "AsyncSession", email_service: EmailService,
    ) -> None:
        self.session = session
        self.email_service = email_service

    async def _already_sent(self, idempotency_key: str) -> EmailSendLog | None:
        return await self.session.scalar(
            select(EmailSendLog).where(
                EmailSendLog.idempotency_key == idempotency_key,
                EmailSendLog.status == "sent",
            )
        )

    async def send(
        self,
        *,
        code: str,
        to: str,
        context: dict,
        user_id: UUID | None = None,
        municipality_id: UUID | None = None,
        facility_id: UUID | None = None,
        idempotency_key: str | None = None,
        tags: dict[str, str] | None = None,
    ) -> DispatchResult:
        # Idempotência: se a chave já foi entregue com sucesso, não reenvia.
        if idempotency_key is not None:
            existing = await self._already_sent(idempotency_key)
            if existing is not None:
                log.info(
                    "email_dispatch_skipped",
                    code=code, to=to, idempotency_key=idempotency_key,
                    prior_log_id=str(existing.id),
                )
                return DispatchResult(
                    status="skipped",
                    message_id=existing.message_id,
                    log_id=existing.id,
                )

        rendered = await EmailTemplateService(self.session).render(
            code, context,
            municipality_id=municipality_id, facility_id=facility_id,
        )
        msg = EmailMessage(
            to=[to],
            subject=rendered.subject,
            html=rendered.html,
            text=rendered.text,
            from_name=rendered.from_name,
            tags={"category": code, **(tags or {})},
        )

        status = "sent"
        error: str | None = None
        message_id = ""
        try:
            message_id = await self.email_service.send(msg)
        except Exception as exc:  # noqa: BLE001
            status = "failed"
            error = str(exc)
            log.error("email_dispatch_failed", code=code, to=to, error=error)

        entry = EmailSendLog(
            user_id=user_id,
            municipality_id=municipality_id,
            template_code=code,
            to_address=to,
            from_address=msg.from_email or settings.email_from,
            subject=rendered.subject,
            message_id=message_id,
            status=status,
            error=error,
            idempotency_key=idempotency_key,
        )
        self.session.add(entry)
        await self.session.flush()

        return DispatchResult(
            status=status, message_id=message_id, log_id=entry.id, error=error,
        )
