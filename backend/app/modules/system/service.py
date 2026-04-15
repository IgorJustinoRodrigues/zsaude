"""Serviço de configurações globais.

Expõe os valores de ``app.system_settings`` como fonte de verdade em runtime.
Mantém um cache in-memory atualizado no startup e em cada `set_value`;
helpers síncronos (`get_int_sync`, `get_bool_sync`, `get_str_sync`) permitem
que funções não-async (como o gerador de tokens e o rate limit do slowapi)
consultem as settings sem precisar abrir uma sessão DB.

Fallback: se a chave não existir no cache/DB, devolve o default (vindo do
``.env`` via ``app.core.config.settings``).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.modules.system.models import SystemSetting

log = get_logger(__name__)

# Cache global, compartilhado entre workers em dev (single worker).
# Em prod multi-worker, um `FLUSHDB`-like via pub/sub seria preciso, mas
# o TTL curto dos tokens absorve pequenas inconsistências (< 60s).
_CACHE: dict[str, Any] = {}


class SettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def warm_up(self) -> int:
        """Lê todas as settings da DB para o cache in-memory. Retorna o total."""
        rows = (await self.db.scalars(select(SystemSetting))).all()
        _CACHE.clear()
        for r in rows:
            _CACHE[r.key] = r.value
        return len(rows)

    async def get(self, key: str, default: Any = None) -> Any:
        if key in _CACHE:
            return _CACHE[key]
        row = await self.db.scalar(
            select(SystemSetting).where(SystemSetting.key == key)
        )
        if row is None:
            return default
        _CACHE[key] = row.value
        return row.value

    async def set_value(self, key: str, value: Any) -> SystemSetting:
        row = await self.db.scalar(
            select(SystemSetting).where(SystemSetting.key == key)
        )
        if row is None:
            raise NotFoundError("Configuração não encontrada.")
        row.value = value
        await self.db.flush()
        _CACHE[key] = value
        return row


# ─── Helpers síncronos ──────────────────────────────────────────────────────

def get_int_sync(key: str, default: int) -> int:
    v = _CACHE.get(key)
    if v is None:
        return default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def get_bool_sync(key: str, default: bool) -> bool:
    v = _CACHE.get(key)
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    if isinstance(v, str):
        return v.lower() in {"true", "1", "yes", "sim"}
    return default


def get_str_sync(key: str, default: str = "") -> str:
    v = _CACHE.get(key)
    if v is None:
        return default
    return str(v)
