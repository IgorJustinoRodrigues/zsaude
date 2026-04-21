"""Serviço genérico de envio de e-mails.

Abstração única usada em reset de senha, verificação de e-mail, parabéns,
relatórios e afins. Três backends:

- ``SmtpEmailService``  → dev (MailHog) e staging com servidor real
- ``SesEmailService``   → prod via AWS SES (aioboto3)
- ``NullEmailService``  → testes; guarda mensagens enviadas em memória

Todos implementam :class:`EmailService`. A escolha vem de ``settings.email_backend``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr
from functools import lru_cache
from typing import Annotated, Protocol

import aiosmtplib
from fastapi import Depends

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)


# ─── Modelo ──────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class Attachment:
    filename: str
    content: bytes
    mime: str = "application/octet-stream"


@dataclass(slots=True)
class EmailMessage:
    """Mensagem independente de transporte."""

    to: list[str]
    subject: str
    html: str | None = None
    text: str | None = None
    from_email: str | None = None       # override; default: settings.email_from
    from_name: str | None = None        # override; default: settings.email_from_name
    reply_to: str | None = None
    cc: list[str] = field(default_factory=list)
    bcc: list[str] = field(default_factory=list)
    attachments: list[Attachment] = field(default_factory=list)
    # Tags ficam no header customizado (SES lê via configuration set).
    tags: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.html and not self.text:
            raise ValueError("EmailMessage precisa de html ou text.")
        if not self.to:
            raise ValueError("EmailMessage precisa de pelo menos um destinatário.")


# ─── Contrato ────────────────────────────────────────────────────────────────


class EmailService(Protocol):
    """Todo transporte implementa esse contrato."""

    async def send(self, msg: EmailMessage) -> str:
        """Envia a mensagem. Retorna o ``message_id`` (ou equivalente)."""
        ...


# ─── Helper comum: montagem do MIME ──────────────────────────────────────────


def _build_mime(msg: EmailMessage) -> MimeMessage:
    mime = MimeMessage()
    from_email = msg.from_email or settings.email_from
    from_name = msg.from_name or settings.email_from_name
    mime["From"] = formataddr((from_name, from_email))
    mime["To"] = ", ".join(msg.to)
    if msg.cc:
        mime["Cc"] = ", ".join(msg.cc)
    mime["Subject"] = msg.subject
    if msg.reply_to:
        mime["Reply-To"] = msg.reply_to
    for k, v in msg.tags.items():
        mime[f"X-Email-Tag-{k}"] = v

    # Corpo: prioriza text como parte principal; html como alternativa.
    if msg.text and msg.html:
        mime.set_content(msg.text)
        mime.add_alternative(msg.html, subtype="html")
    elif msg.html:
        mime.set_content(msg.html, subtype="html")
    else:
        assert msg.text is not None  # garantido pelo __post_init__
        mime.set_content(msg.text)

    for att in msg.attachments:
        maintype, _, subtype = att.mime.partition("/")
        mime.add_attachment(
            att.content,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=att.filename,
        )
    return mime


def _all_recipients(msg: EmailMessage) -> list[str]:
    return [*msg.to, *msg.cc, *msg.bcc]


# ─── NullEmailService (testes) ───────────────────────────────────────────────


class NullEmailService:
    """Backend que não envia; guarda as mensagens em memória pra asserts.

    Em testes, use ``svc.outbox[-1]`` pra inspecionar o último e-mail.
    """

    def __init__(self) -> None:
        self.outbox: list[EmailMessage] = []

    async def send(self, msg: EmailMessage) -> str:
        self.outbox.append(msg)
        fake_id = f"null-{len(self.outbox)}"
        log.info("email_null_captured", to=msg.to, subject=msg.subject, message_id=fake_id)
        return fake_id


# ─── SmtpEmailService (dev/staging) ──────────────────────────────────────────


class SmtpEmailService:
    """Envio via SMTP. Em dev aponta pro MailHog."""

    def __init__(
        self,
        *,
        host: str,
        port: int,
        user: str = "",
        password: str = "",
        use_tls: bool = False,
    ) -> None:
        self._host = host
        self._port = port
        self._user = user
        self._password = password
        self._use_tls = use_tls

    async def send(self, msg: EmailMessage) -> str:
        mime = _build_mime(msg)
        recipients = _all_recipients(msg)
        await aiosmtplib.send(
            mime,
            hostname=self._host,
            port=self._port,
            username=self._user or None,
            password=self._password or None,
            use_tls=self._use_tls,
            recipients=recipients,
        )
        # MailHog/smtplib não expõe message-id útil; usamos o que o mime fabricou.
        message_id = mime.get("Message-ID", "") or f"smtp:{id(mime)}"
        log.info("email_smtp_sent", to=msg.to, subject=msg.subject, message_id=message_id)
        return message_id


# ─── SesEmailService (prod) ──────────────────────────────────────────────────


class SesEmailService:
    """Envio via AWS SES usando aioboto3.

    ``region`` e credenciais vêm das settings. Se ``configuration_set`` for
    informado, é incluído no request (pra tracking de bounces/complaints via SNS).
    """

    def __init__(
        self,
        *,
        region: str,
        access_key: str,
        secret_key: str,
        configuration_set: str = "",
    ) -> None:
        self._region = region
        self._access_key = access_key
        self._secret_key = secret_key
        self._configuration_set = configuration_set

    async def send(self, msg: EmailMessage) -> str:
        import aioboto3  # import tardio pra não pagar boot quando não usado

        session = aioboto3.Session(
            aws_access_key_id=self._access_key or None,
            aws_secret_access_key=self._secret_key or None,
            region_name=self._region,
        )
        mime = _build_mime(msg)
        recipients = _all_recipients(msg)
        raw_message = {"Data": mime.as_bytes()}
        kwargs: dict = {
            "Source": formataddr((
                msg.from_name or settings.email_from_name,
                msg.from_email or settings.email_from,
            )),
            "Destinations": recipients,
            "RawMessage": raw_message,
        }
        if self._configuration_set:
            kwargs["ConfigurationSetName"] = self._configuration_set
        if msg.tags:
            kwargs["Tags"] = [
                {"Name": k, "Value": v} for k, v in msg.tags.items()
            ]

        async with session.client("ses", region_name=self._region) as ses:
            resp = await ses.send_raw_email(**kwargs)
        message_id = resp.get("MessageId", "")
        log.info("email_ses_sent", to=msg.to, subject=msg.subject, message_id=message_id)
        return message_id


# ─── Factory + dependency ────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _build_service() -> EmailService:
    backend = settings.email_backend
    if backend == "null":
        return NullEmailService()
    if backend == "ses":
        return SesEmailService(
            region=settings.aws_region,
            access_key=settings.aws_access_key_id,
            secret_key=settings.aws_secret_access_key,
            configuration_set=settings.ses_configuration_set,
        )
    # default: smtp
    return SmtpEmailService(
        host=settings.smtp_host,
        port=settings.smtp_port,
        user=settings.smtp_user,
        password=settings.smtp_password,
        use_tls=settings.smtp_use_tls,
    )


def get_email_service() -> EmailService:
    """Dependency FastAPI. O backend é decidido uma única vez no boot."""
    return _build_service()


EmailServiceDep = Annotated[EmailService, Depends(get_email_service)]


def reset_email_service_cache() -> None:
    """Limpa o cache do serviço. Usado em testes que alternam backends."""
    _build_service.cache_clear()
