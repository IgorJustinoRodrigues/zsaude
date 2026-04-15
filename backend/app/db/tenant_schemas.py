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

import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_IBGE_RE = re.compile(r"^\d{6,7}$")


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


async def ensure_municipality_schema(session: AsyncSession, ibge: str) -> str:
    """Cria o schema do município (idempotente). Retorna o nome do schema.

    Futuramente, após criar o schema, aplica as migrations locais
    (tabelas de pacientes, agendamentos etc. que vão em cada mun_<ibge>).
    """
    name = schema_for_municipality(ibge)
    # Nome já validado pelo regex; ainda assim mantemos entre aspas duplas.
    await session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{name}"'))
    # Hook para aplicar migrations locais quando existirem:
    # await apply_tenant_migrations(session, name)
    return name


async def drop_municipality_schema(session: AsyncSession, ibge: str, *, cascade: bool = False) -> None:
    """Remove o schema do município. Por padrão só dropa se vazio."""
    name = schema_for_municipality(ibge)
    suffix = " CASCADE" if cascade else ""
    await session.execute(text(f'DROP SCHEMA IF EXISTS "{name}"{suffix}'))
