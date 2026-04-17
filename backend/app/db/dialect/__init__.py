"""Factory de DialectAdapters.

Uso::

    from app.db.dialect import get_adapter, adapter_for_engine

    adapter = get_adapter("postgresql")
    adapter = adapter_for_engine(engine)
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from app.db.dialect.base import DialectAdapter
from app.db.dialect.oracle import OracleAdapter
from app.db.dialect.postgresql import PostgreSQLAdapter

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

__all__ = [
    "DialectAdapter",
    "PostgreSQLAdapter",
    "OracleAdapter",
    "get_adapter",
    "adapter_for_engine",
]

_ADAPTERS: dict[str, type[DialectAdapter]] = {
    "postgresql": PostgreSQLAdapter,
    "oracle": OracleAdapter,
}


@lru_cache(maxsize=4)
def get_adapter(dialect_name: str) -> DialectAdapter:
    """Retorna singleton do adapter para o dialect informado."""
    cls = _ADAPTERS.get(dialect_name)
    if cls is None:
        raise ValueError(f"Dialect não suportado: {dialect_name!r}")
    return cls()


def adapter_for_engine(engine: AsyncEngine) -> DialectAdapter:
    """Retorna o adapter correspondente ao dialect do engine."""
    return get_adapter(engine.dialect.name)
