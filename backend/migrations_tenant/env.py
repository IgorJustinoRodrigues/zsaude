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
    # prioridade: -x tenant_schema=... > env ALEMBIC_TENANT_SCHEMA
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
    # Garante que o schema existe.
    connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    connection.commit()

    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=schema,
        compare_type=True,
        compare_server_default=True,
        # Usamos search_path (setado via server_settings da conexão) para
        # resolver schemas dos models (que são None).
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    schema = _resolve_schema()
    # server_settings garante que TODA transação dessa conexão já começa
    # com o search_path correto — sem depender de SET espalhado no env.
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={
            "server_settings": {"search_path": f'"{schema}", "app", "public"'},
        },
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations, schema)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
