"""Seed de ``app.system_settings`` — config bootstrap do sistema.

Chaves obrigatórias pra autenticação, rate limiting e textos. Sem elas
o sistema sobe mas comportamentos caem em defaults hardcoded. Também
inclui ``cadsus.base`` (credencial fallback CadSUS).

Idempotente: faz upsert por ``key``.
"""

from __future__ import annotations

import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dialect import get_adapter
from app.db.types import new_uuid7
from app.modules.system.models import SystemSetting


# key, valor (qualquer JSON), descrição
SYSTEM_SETTINGS: list[tuple[str, object, str]] = [
    ("password_min_length", 8, "Comprimento mínimo de senha"),
    ("password_require_special", True, "Exige caractere especial em senhas"),
    ("access_token_ttl_minutes", 15, "TTL do access token (min)"),
    ("refresh_token_ttl_days", 30, "TTL do refresh token (dias)"),
    ("login_rate_limit_per_min", 5, "Tentativas de login por IP/min"),
    ("default_language", "pt-BR", "Idioma padrão"),
    ("app_name", "zSaúde", "Nome exibido"),
    (
        "cadsus.base",
        {"username": "", "password_enc": "", "kind": "user_password"},
        "Credenciais globais CadSUS (fallback quando município não configura)",
    ),
]


async def apply(session: AsyncSession) -> int:
    """Aplica os settings. Retorna quantos foram tocados."""
    adapter = get_adapter(session.bind.dialect.name)
    values = [
        {
            "id": new_uuid7(),
            "key": key,
            "value": value,
            "description": desc,
        }
        for key, value, desc in SYSTEM_SETTINGS
    ]
    await adapter.execute_upsert(
        session,
        SystemSetting,
        values,
        index_elements=["key"],
        update_columns=["value", "description"],
    )
    return len(values)
