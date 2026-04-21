"""Alembic env para migrations per-município.

Uso:
    alembic -c alembic_tenant.ini -x tenant_schema=mun_5208707 upgrade head

Ou via variável de ambiente:
    ALEMBIC_TENANT_SCHEMA=mun_5208707 alembic -c alembic_tenant.ini upgrade head

Cada schema tem sua própria tabela `alembic_version` (versão de schema é
rastreada independentemente por município). Antes de rodar, o `search_path`
é ajustado para o schema de destino, então as tabelas são criadas lá.
"""

from __future__ import annotations

import asyncio
import os
import re
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.tenant_models import TenantBase
from app.tenant_models import _registry  # noqa: F401  - popula metadata

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = TenantBase.metadata


def _resolve_schema() -> str:
    x = context.get_x_argument(as_dictionary=True)
    schema = x.get("tenant_schema") or os.environ.get("ALEMBIC_TENANT_SCHEMA")
    if not schema:
        raise RuntimeError(
            "Informe o schema destino: -x tenant_schema=mun_XXXXXXX "
            "ou defina ALEMBIC_TENANT_SCHEMA."
        )
    if not re.match(r"^mun_\d{6,7}$", schema):
        raise RuntimeError(f"Schema inválido: {schema!r}")
    return schema


def _detect_dialect() -> str:
    url = settings.database_url
    return url.split("+")[0].split(":")[0]


def run_migrations_offline() -> None:
    schema = _resolve_schema()
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        version_table_schema=schema,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection, schema: str) -> None:
    dialect = connection.dialect.name

    if dialect == "postgresql":
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        connection.commit()
    # Oracle: schema (user) is created by the adapter before migrations run

    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=schema if dialect == "postgresql" else None,
        compare_type=True,
        compare_server_default=True,
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    schema = _resolve_schema()
    dialect = _detect_dialect()

    connect_args: dict = {}
    if dialect == "postgresql":
        connect_args["server_settings"] = {
            "search_path": f'"{schema}", "app", "public"',
        }

    engine_config = config.get_section(config.config_ini_section) or {}

    connectable = async_engine_from_config(
        engine_config,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )
    async with connectable.connect() as connection:
        if dialect == "oracle":
            await connection.execute(
                text(f'ALTER SESSION SET CURRENT_SCHEMA = "{schema.upper()}"')
            )
        await connection.run_sync(do_run_migrations, schema)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
