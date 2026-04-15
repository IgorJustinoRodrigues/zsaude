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
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

log = get_logger(__name__)

_IBGE_RE = re.compile(r"^\d{6,7}$")

# Raiz do projeto backend (onde vivem os .ini do Alembic).
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
) -> str:
    """Cria o schema do município e aplica as tenant migrations.

    Retorna o nome do schema. Idempotente: chamar repetidamente é seguro,
    o Alembic só aplica o que falta.

    Para provisionamentos em massa (seed), passe `apply_migrations=False`
    e chame `apply_tenant_migrations(schema)` em lote no final — evita
    overhead de abrir um engine novo a cada município.
    """
    name = schema_for_municipality(ibge)
    await session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{name}"'))
    # Precisa commitar antes de o Alembic abrir nova conexão,
    # senão a transação paralela não vê o CREATE SCHEMA.
    await session.commit()

    if apply_migrations:
        await apply_tenant_migrations(name)

    return name


def _run_alembic_upgrade_sync(schema: str, revision: str = "head") -> None:
    """Executa `alembic -c alembic_tenant.ini -x tenant_schema=<schema> upgrade head`.

    Sync — é usado dentro de `asyncio.to_thread`.
    """
    cfg = Config(str(_BACKEND_ROOT / "alembic_tenant.ini"))
    # O env.py do tenant lê esta env var (evita dependência dos x_arguments
    # internos do alembic, que mudam entre versões).
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

    Roda em thread separada porque o `command.upgrade` do Alembic é sync e
    chama `asyncio.run()` por dentro (via env.py assíncrono), o que não
    pode acontecer dentro de um loop já rodando.
    """
    if not _IBGE_RE.match(schema.removeprefix("mun_")):
        raise ValueError(f"Schema inválido para tenant migration: {schema!r}")
    log.info("tenant_migrations_start", schema=schema, revision=revision)
    await asyncio.to_thread(_run_alembic_upgrade_sync, schema, revision)
    log.info("tenant_migrations_ok", schema=schema)


async def drop_municipality_schema(session: AsyncSession, ibge: str, *, cascade: bool = False) -> None:
    """Remove o schema do município. Por padrão só dropa se vazio."""
    name = schema_for_municipality(ibge)
    suffix = " CASCADE" if cascade else ""
    await session.execute(text(f'DROP SCHEMA IF EXISTS "{name}"{suffix}'))
