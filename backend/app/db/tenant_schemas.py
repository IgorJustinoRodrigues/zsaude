"""Helpers para o modelo multi-tenant schema-per-município.

- Cada município tem um schema dedicado `mun_<ibge>` (usamos o IBGE porque
  é estável, único e já vive em `app.municipalities.ibge`).
- O schema compartilhado `app` guarda identidade, diretório, auditoria,
  RBAC e terminologias (tudo que não pertence a um município específico).
- `search_path` é ajustado por transação (SET LOCAL) com base no contexto
  ativo. Queries não qualificadas resolvem primeiro no schema do município,
  e caem em `app` / `public` como fallback.
"""

from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.logging import get_logger
from app.db.dialect import adapter_for_engine

log = get_logger(__name__)

_IBGE_RE = re.compile(r"^\d{6,7}$")

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def schema_for_municipality(ibge: str) -> str:
    """Gera o nome de schema para um município a partir do IBGE."""
    if not _IBGE_RE.match(ibge):
        raise ValueError(f"IBGE inválido: {ibge!r}")
    return f"mun_{ibge}"


def search_path_for(ibge: str | None) -> str:
    """Retorna a string a ser usada em SET LOCAL search_path.

    Nomes entre aspas duplas para preservar underline/maiúsculas se houver.
    """
    if ibge and _IBGE_RE.match(ibge):
        return f'"mun_{ibge}", "app", "public"'
    return '"app", "public"'


async def ensure_municipality_schema(
    session: AsyncSession,
    ibge: str,
    *,
    apply_migrations: bool = True,
    engine: AsyncEngine | None = None,
) -> str:
    """Cria o schema do município e aplica as tenant migrations.

    Retorna o nome do schema. Idempotente: chamar repetidamente é seguro,
    o Alembic só aplica o que falta.

    Para provisionamentos em massa (seed), passe `apply_migrations=False`
    e chame `apply_tenant_migrations(schema)` em lote no final.
    """
    name = schema_for_municipality(ibge)
    eng = engine or session.bind
    adapter = adapter_for_engine(eng)

    async with eng.begin() as conn:
        await adapter.create_schema(conn, name)

    if apply_migrations:
        dialect = eng.dialect.name
        if dialect == "oracle":
            await _create_tenant_tables_oracle(eng, name)
        else:
            await apply_tenant_migrations(name)

    return name


async def _create_tenant_tables_oracle(eng: AsyncEngine, schema: str) -> None:
    """No Oracle, cria tabelas tenant via metadata.create_all (sem Alembic).

    Usa um engine temporário com event listener isolado para não interferir
    com o engine principal.
    """
    from sqlalchemy.ext.asyncio import create_async_engine as _create

    from app.core.config import settings as app_settings
    from app.tenant_models import TenantBase
    import app.tenant_models._registry  # noqa: F401 - popula metadata

    tmp_eng = _create(app_settings.database_url, pool_size=1, max_overflow=0)

    from sqlalchemy import event as sa_event

    @sa_event.listens_for(tmp_eng.sync_engine, "connect")
    def _set_schema(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute(f'ALTER SESSION SET CURRENT_SCHEMA = "{schema.upper()}"')
        cursor.close()

    def _do_create(connection):
        result = connection.execute(text(
            f"SELECT COUNT(*) FROM all_tables WHERE owner = :o"
        ), {"o": schema.upper()})
        if result.scalar() > 0:
            log.info("tenant_tables_exist_skip", schema=schema)
            return
        TenantBase.metadata.create_all(connection)

    try:
        async with tmp_eng.begin() as conn:
            await conn.run_sync(_do_create)
        log.info("tenant_tables_created_oracle", schema=schema)
    finally:
        await tmp_eng.dispose()


def _run_alembic_upgrade_sync(schema: str, revision: str = "head") -> None:
    """Executa `alembic -c alembic_tenant.ini upgrade head` para o schema."""
    cfg = Config(str(_BACKEND_ROOT / "alembic_tenant.ini"))
    prev = os.environ.get("ALEMBIC_TENANT_SCHEMA")
    os.environ["ALEMBIC_TENANT_SCHEMA"] = schema
    try:
        command.upgrade(cfg, revision)
    finally:
        if prev is None:
            os.environ.pop("ALEMBIC_TENANT_SCHEMA", None)
        else:
            os.environ["ALEMBIC_TENANT_SCHEMA"] = prev


async def apply_tenant_migrations(schema: str, revision: str = "head") -> None:
    """Aplica as migrations do tenant para o schema informado.

    Roda em thread separada porque o `command.upgrade` do Alembic é sync.
    """
    if not _IBGE_RE.match(schema.removeprefix("mun_")):
        raise ValueError(f"Schema inválido para tenant migration: {schema!r}")
    log.info("tenant_migrations_start", schema=schema, revision=revision)
    await asyncio.to_thread(_run_alembic_upgrade_sync, schema, revision)
    log.info("tenant_migrations_ok", schema=schema)


async def drop_municipality_schema(
    session: AsyncSession,
    ibge: str,
    *,
    cascade: bool = False,
    engine: AsyncEngine | None = None,
) -> None:
    """Remove o schema do município. Por padrão só dropa se vazio."""
    name = schema_for_municipality(ibge)
    eng = engine or session.bind
    adapter = adapter_for_engine(eng)

    async with eng.begin() as conn:
        await adapter.drop_schema(conn, name, cascade=cascade)
