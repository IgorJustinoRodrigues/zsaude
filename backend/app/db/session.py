"""Engine async, sessionmaker e RLS listener.

Uso:
    async with get_session() as session:
        ...

Para endpoints FastAPI, usar a dependency `get_db` em core/deps.py.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.audit import get_audit_context
from app.core.config import settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def create_engine() -> AsyncEngine:
    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=3600,
    )


def engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_engine()
        _register_rls_listener(_engine)
    return _engine


def sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            bind=engine(),
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
    return _sessionmaker


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    async with sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─── RLS listener ────────────────────────────────────────────────────────────


def _register_rls_listener(engine: AsyncEngine) -> None:
    """Aplica SET LOCAL com o contexto de auditoria atual em cada BEGIN.

    As políticas RLS no banco consultam `current_setting('app.current_*')`,
    então cada transação começa configurando essas chaves antes de qualquer
    SELECT/UPDATE tenant-scoped.
    """

    sync_engine = engine.sync_engine

    @event.listens_for(sync_engine, "begin")
    def _on_begin(conn):  # type: ignore[no-untyped-def]
        ctx = get_audit_context()
        # set_config(name, value, is_local=true) é a forma parametrizada de
        # SET LOCAL no Postgres. Seguro contra SQL injection.
        def _set(key: str, value: str) -> None:
            conn.exec_driver_sql(
                "SELECT set_config($1, $2, true)", (key, value)
            )

        _set("app.current_user_id", str(ctx.user_id) if ctx.user_id else "")
        _set("app.current_municipality_id", str(ctx.municipality_id) if ctx.municipality_id else "")
        _set("app.current_facility_id", str(ctx.facility_id) if ctx.facility_id else "")
        _set("app.current_role", ctx.role or "")
        _set("app.request_id", ctx.request_id or "")


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
