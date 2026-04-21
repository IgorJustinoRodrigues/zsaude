"""Provisioning do schema ``app`` (identidade, terminologias, IA).

Em **Postgres** o schema é criado via Alembic (``alembic upgrade head``)
— as migrations fazem DDL + seeds.

Em **Oracle** as migrations não rodam (usam SQL PG-específico). Este módulo
provê a alternativa:

1. ``Base.metadata.create_all`` cria todas as tabelas do schema ``app`` a
   partir dos models SQLAlchemy (tipos nativos via ``UUIDType``, ``JSONType``,
   ``VectorType``).
2. ``apply_all_seeds`` popula os dados obrigatórios (system_settings,
   tabelas de referência, catálogo IA).

Uso::

    from app.db.session import engine
    from app.db.provisioning import provision_app_schema

    await provision_app_schema(engine())
"""

from __future__ import annotations

import time

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.logging import get_logger
from app.db.base import Base
from app.db.schema_migrator import evolve_schema
from app.db.schema_version import (
    compute_fingerprint,
    read_schema_record,
    write_schema_record,
)
from app.db.seeds import apply_all_seeds

# Imports que populam o metadata com TODOS os models do schema app.
# Sem isso, ``Base.metadata.create_all`` não sabe quais tabelas criar.
import app.db.file_model  # noqa: F401
import app.db.models_registry  # noqa: F401  — importa todos os models app

log = get_logger(__name__)


async def provision_app_schema(
    engine: AsyncEngine,
    *,
    apply_seeds: bool = True,
    auto_evolve: bool = True,
    allow_modify: bool = False,
) -> dict[str, int | str | list]:
    """Cria/evolui o schema ``app`` no banco conectado. Idempotente.

    Etapas:
    1. ``CREATE TABLE`` para tabelas novas (``metadata.create_all(checkfirst=True)``).
    2. Em Oracle: ``ALTER TABLE ADD COLUMN`` para colunas novas nos models
       (via ``schema_migrator``).
    3. (Se ``allow_modify``) ``ALTER TABLE MODIFY`` para colunas que
       mudaram tipo/tamanho/nullable.
    4. Aplica seeds (se ``apply_seeds``).
    5. Registra fingerprint em ``APP.SCHEMA_VERSION`` (Oracle).

    Parâmetros:
    - ``apply_seeds``: roda seeds de bootstrap. Default ``True``.
    - ``auto_evolve``: aplica ``ALTER TABLE ADD COLUMN``. Default ``True``.
    - ``allow_modify``: aplica ``ALTER TABLE MODIFY`` pra tipo/nullable.
      Default ``False`` — arriscado em tabela com dados (pode falhar se
      não couberem). Seguro em ambiente novo.

    Retorna: dict com ``dialect``, contadores dos seeds, ``added_columns``,
    ``modified_columns``, ``fingerprint``.
    """
    dialect = engine.dialect.name
    started = time.monotonic()

    if dialect == "postgresql":
        async with engine.begin() as conn:
            await conn.execute(text('CREATE SCHEMA IF NOT EXISTS "app"'))
            await conn.run_sync(
                lambda c: Base.metadata.create_all(c, checkfirst=True)
            )
    elif dialect == "oracle":
        # Oracle: schema=user. Base.metadata.schema="app" → None (CURRENT_SCHEMA).
        async with engine.begin() as conn:
            conn = await conn.execution_options(
                schema_translate_map={"app": None},
            )
            # 1) Cria tabelas que faltam.
            await conn.run_sync(
                lambda c: Base.metadata.create_all(c, checkfirst=True)
            )
            # 2) Evolui tabelas existentes (ADD / MODIFY COLUMN).
            evolve_summary = None
            if auto_evolve:
                evolve_summary = await conn.run_sync(
                    lambda c: evolve_schema(
                        c, Base.metadata,
                        schema_translate={"app": None},
                        allow_modify=allow_modify,
                    )
                )
    else:
        raise NotImplementedError(f"Dialect não suportado: {dialect}")

    log.info(
        "app_schema_created",
        dialect=dialect,
        duration_ms=int((time.monotonic() - started) * 1000),
    )

    counts: dict[str, int | str | list] = {"dialect": dialect}
    if dialect == "oracle" and auto_evolve and evolve_summary is not None:
        counts["added_columns"] = evolve_summary.added_columns
        counts["modified_columns"] = evolve_summary.modified_columns
        counts["dropped_columns"] = evolve_summary.dropped_columns
        if evolve_summary.warnings:
            counts["evolve_warnings"] = evolve_summary.warnings

    if apply_seeds:
        seed_engine = (
            engine.execution_options(schema_translate_map={"app": None})
            if dialect == "oracle"
            else engine
        )
        async with AsyncSession(seed_engine) as session:
            seed_counts = await apply_all_seeds(session)
            await session.commit()
            counts.update(seed_counts)

    # Registra versão (Oracle apenas — PG usa alembic_version).
    if dialect == "oracle":
        fingerprint = compute_fingerprint(Base.metadata)
        counts["fingerprint"] = fingerprint
        seed_engine = engine.execution_options(
            schema_translate_map={"app": None}
        )
        async with seed_engine.begin() as conn:
            await conn.run_sync(
                lambda c: write_schema_record(
                    c, "app",
                    fingerprint=fingerprint,
                    table_count=len(Base.metadata.tables),
                    details={
                        "seeds": {k: v for k, v in counts.items() if k not in {"dialect", "fingerprint", "added_columns", "dropped_columns", "evolve_warnings"}},
                        "added_columns": counts.get("added_columns", []),
                    },
                )
            )

    return counts


async def read_app_schema_version(engine: AsyncEngine) -> dict | None:
    """Lê o registro atual de versão do schema app (Oracle)."""
    if engine.dialect.name != "oracle":
        return None
    seed_engine = engine.execution_options(schema_translate_map={"app": None})
    async with seed_engine.connect() as conn:
        record = await conn.run_sync(lambda c: read_schema_record(c, "app"))
    if record is None:
        return None
    return {
        "id": record.id,
        "fingerprint": record.fingerprint,
        "table_count": record.table_count,
        "applied_at": record.applied_at,
        "details": record.details,
    }
