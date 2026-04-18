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

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.seeds.ai_catalog import apply as apply_ai_catalog
from app.db.seeds.reference_tables import apply as apply_reference_tables
from app.db.seeds.system_settings import apply as apply_system_settings

log = get_logger(__name__)


async def apply_all_seeds(session: AsyncSession) -> dict[str, int]:
    """Aplica todos os seeds do schema app em ordem. Idempotente.

    Retorna dict com a contagem de linhas inseridas/atualizadas por seed.
    """
    result: dict[str, int] = {}
    result["system_settings"] = await apply_system_settings(session)
    result["reference_tables"] = await apply_reference_tables(session)
    result["ai_catalog"] = await apply_ai_catalog(session)
    log.info("seeds_applied", **result)
    return result


__all__ = [
    "apply_all_seeds",
    "apply_system_settings",
    "apply_reference_tables",
    "apply_ai_catalog",
]
