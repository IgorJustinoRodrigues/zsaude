"""Seeds do schema ``app`` — dados de referência/bootstrap reutilizáveis.

Em **Postgres**, os seeds vivem dentro das migrations Alembic (ver
``backend/migrations/versions/0012..0025``) e são aplicados junto com elas.
Em **Oracle**, como as migrations Alembic usam SQL PG-específico, o schema
é criado via ``metadata.create_all`` (ver ``app/db/provisioning.py``) e
este módulo é quem insere os dados.

Todas as funções são **idempotentes** — fazem upsert via
``DialectAdapter.execute_upsert``. Podem ser chamadas múltiplas vezes.

Uso::

    from app.db.seeds import apply_all_seeds

    async with AsyncSession(engine) as s:
        await apply_all_seeds(s)
        await s.commit()
"""

from __future__ import annotations

import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.seeds.ai_catalog import apply as apply_ai_catalog
from app.db.seeds.reference_tables import apply as apply_reference_tables
from app.db.seeds.system_settings import apply as apply_system_settings

log = get_logger(__name__)


async def _time(name: str, session: AsyncSession, fn) -> int:
    """Cronometra a execução de um seed e loga estruturado."""
    t0 = time.monotonic()
    rows = await fn(session)
    duration_ms = int((time.monotonic() - t0) * 1000)
    log.info("seed_applied", name=name, rows=rows, duration_ms=duration_ms)
    return rows


async def apply_all_seeds(session: AsyncSession) -> dict[str, int]:
    """Aplica todos os seeds do schema app em ordem. Idempotente.

    Retorna dict com a contagem de linhas inseridas/atualizadas por seed.
    Loga ``seed_applied`` com ``name``, ``rows``, ``duration_ms`` por item.
    """
    result: dict[str, int] = {}
    result["system_settings"] = await _time("system_settings", session, apply_system_settings)
    result["reference_tables"] = await _time("reference_tables", session, apply_reference_tables)
    result["ai_catalog"] = await _time("ai_catalog", session, apply_ai_catalog)
    log.info("seeds_applied_all", **result)
    return result


__all__ = [
    "apply_all_seeds",
    "apply_system_settings",
    "apply_reference_tables",
    "apply_ai_catalog",
]
