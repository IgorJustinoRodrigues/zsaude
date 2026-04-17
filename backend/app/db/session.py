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


def _schema_translate_map() -> dict[str, str | None] | None:
    """No Oracle, mapeia schema 'app' → None (usa CURRENT_SCHEMA)."""
    dialect = settings.database_url.split("+")[0].split(":")[0]
    if dialect == "oracle":
        return {"app": "APP"}
    return None


def create_engine() -> AsyncEngine:
    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=3600,
        execution_options={"schema_translate_map": _schema_translate_map()},
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


def _set_tenant_context_pg(conn, ctx) -> None:
    """Configura search_path e variáveis de sessão para PostgreSQL (sync)."""
    from app.db.tenant_schemas import search_path_for

    path = search_path_for(ctx.municipality_ibge)
    conn.exec_driver_sql(f"SET LOCAL search_path = {path}")

    def _set(key: str, value: str) -> None:
        conn.exec_driver_sql(
            "SELECT set_config($1, $2, true)", (key, value),
        )

    _set("app.current_user_id", str(ctx.user_id) if ctx.user_id else "")
    _set("app.current_municipality_id", str(ctx.municipality_id) if ctx.municipality_id else "")
    _set("app.current_municipality_ibge", ctx.municipality_ibge or "")
    _set("app.current_facility_id", str(ctx.facility_id) if ctx.facility_id else "")
    _set("app.current_role", ctx.role or "")
    _set("app.request_id", ctx.request_id or "")


def _set_tenant_context_oracle(conn, ctx) -> None:
    """Configura current_schema e variáveis de sessão para Oracle (sync)."""
    ibge = ctx.municipality_ibge
    schema = f"MUN_{ibge}" if ibge else "APP"
    conn.exec_driver_sql(f'ALTER SESSION SET CURRENT_SCHEMA = "{schema}"')

    def _set(key: str, value: str) -> None:
        conn.exec_driver_sql(
            "BEGIN ZSAUDE.ZSAUDE_CTX_PKG.set_val(:k, :v); END;",
            {"k": key, "v": value},
        )

    _set("app.current_user_id", str(ctx.user_id) if ctx.user_id else "")
    _set("app.current_municipality_id", str(ctx.municipality_id) if ctx.municipality_id else "")
    _set("app.current_municipality_ibge", ctx.municipality_ibge or "")
    _set("app.current_facility_id", str(ctx.facility_id) if ctx.facility_id else "")
    _set("app.current_role", ctx.role or "")
    _set("app.request_id", ctx.request_id or "")


def _register_rls_listener(eng: AsyncEngine) -> None:
    """Aplica SET LOCAL / ALTER SESSION com o contexto em cada BEGIN.

    Detecta o dialect do engine e usa a implementação correta.
    """
    sync_engine = eng.sync_engine
    dialect_name = sync_engine.dialect.name

    if dialect_name == "postgresql":
        _set_ctx = _set_tenant_context_pg
    elif dialect_name == "oracle":
        _set_ctx = _set_tenant_context_oracle
    else:
        return

    @event.listens_for(sync_engine, "begin")
    def _on_begin(conn):  # type: ignore[no-untyped-def]
        ctx = get_audit_context()
        _set_ctx(conn, ctx)


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
