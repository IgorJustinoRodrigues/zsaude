"""Redação de PII (dados pessoais) em textos antes de enviar ao provider.

Mascara CPF, CNS, telefone e email por regex. Configurável via
``system_settings`` (``ai.pii_redaction``: true/false).

Não aplica em providers locais (Ollama) — o dado fica no próprio servidor.

Uso no ``AIService``: chamar ``redact_messages(messages, provider_slug)``
antes de montar o ChatRequest final que vai pro provider.
"""

from __future__ import annotations

import re

from app.modules.ai.models import AISdkKind
from app.modules.ai.providers.base import ChatMessage, ContentPart
from app.modules.system.service import get_bool_sync

# Regex patterns
_CPF_RE = re.compile(r"\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b")
_CNS_RE = re.compile(r"\b\d{3}\s?\d{4}\s?\d{4}\s?\d{4}\b")
_PHONE_RE = re.compile(r"\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4}\b")
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")

_REPLACEMENTS = [
    (_CPF_RE, "[CPF-REDACTED]"),
    (_CNS_RE, "[CNS-REDACTED]"),
    (_PHONE_RE, "[PHONE-REDACTED]"),
    (_EMAIL_RE, "[EMAIL-REDACTED]"),
]

# Providers locais — PII não sai do servidor, não precisa mascarar.
_LOCAL_SDKS = {AISdkKind.ollama}


def _is_enabled() -> bool:
    return get_bool_sync("ai.pii_redaction", True)


def _redact_text(text: str) -> str:
    for pattern, replacement in _REPLACEMENTS:
        text = pattern.sub(replacement, text)
    return text


def redact_messages(
    messages: list[ChatMessage],
    sdk_kind: AISdkKind,
) -> list[ChatMessage]:
    """Retorna cópia das mensagens com PII mascarado.

    Sem efeito se:
    - ``ai.pii_redaction`` estiver False em system_settings
    - Provider for local (Ollama)
    """
    if not _is_enabled():
        return messages
    if sdk_kind in _LOCAL_SDKS:
        return messages

    result: list[ChatMessage] = []
    for m in messages:
        if isinstance(m.content, str):
            result.append(ChatMessage(role=m.role, content=_redact_text(m.content)))
        else:
            parts: list[ContentPart] = []
            for p in m.content:
                if p.kind == "text" and p.text:
                    parts.append(ContentPart(
                        kind="text",
                        text=_redact_text(p.text),
                        image_url=p.image_url,
                        image_detail=p.image_detail,
                    ))
                else:
                    parts.append(p)
            result.append(ChatMessage(role=m.role, content=parts))
    return result
