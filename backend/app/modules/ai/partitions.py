"""Cria partições mensais futuras de ``ai_usage_logs``.

Roda no startup (lifespan) e pode rodar via cron. Idempotente: cria só
as partições que não existem (``IF NOT EXISTS``).

Mantém 3 meses à frente do mês atual. Partições do passado NÃO são
criadas aqui — elas já foram criadas na migration 0019 ou em boots
anteriores.

Particionamento só funciona em PostgreSQL. Em Oracle, a tabela não é
particionada — esta função retorna 0 silenciosamente.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

_MONTHS_AHEAD = 3


def _iter_future_months(start: date, count: int):
    d = start.replace(day=1)
    for _ in range(count):
        if d.month == 12:
            d = d.replace(year=d.year + 1, month=1)
        else:
            d = d.replace(month=d.month + 1)
        yield d


async def ensure_partitions(db: AsyncSession) -> int:
    """Cria partições mensais futuras que não existem. Retorna quantas criou."""
    if db.bind.dialect.name != "postgresql":
        return 0

    today = datetime.now(UTC).date()
    created = 0
    for d in _iter_future_months(today, _MONTHS_AHEAD):
        tag = f"{d.year:04d}{d.month:02d}"
        table_name = f"ai_usage_logs_{tag}"
        if d.month == 12:
            ny, nm = d.year + 1, 1
        else:
            ny, nm = d.year, d.month + 1
        start = f"{d.year:04d}-{d.month:02d}-01"
        end = f"{ny:04d}-{nm:02d}-01"

        exists = await db.scalar(
            text(
                "SELECT 1 FROM pg_catalog.pg_class c "
                "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'app' AND c.relname = :name"
            ),
            {"name": table_name},
        )
        if exists:
            continue

        await db.execute(
            text(
                f"CREATE TABLE app.{table_name} PARTITION OF app.ai_usage_logs "
                f"FOR VALUES FROM ('{start}') TO ('{end}')"
            ),
        )
        log.info("ai_partition_created", extra={"table": table_name})
        created += 1

    return created
