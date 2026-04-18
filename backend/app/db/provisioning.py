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

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.logging import get_logger
from app.db.base import Base
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
) -> dict[str, int | str]:
    """Cria o schema ``app`` no banco conectado. Idempotente.

    - **PostgreSQL**: cria o schema SQL ``app`` + tabelas via
      ``metadata.create_all``. Normalmente é feito por Alembic, mas este
      caminho é útil em testes e CI.
    - **Oracle**: cria as tabelas diretamente no schema do usuário ativo
      (recomendado: user ``APP`` ou ``ZSAUDE``). Não há conceito de
      "schema" separado em Oracle além de usuário.

    Retorna dict com contadores dos seeds aplicados.
    """
    dialect = engine.dialect.name

    if dialect == "postgresql":
        async with engine.begin() as conn:
            await conn.execute(text('CREATE SCHEMA IF NOT EXISTS "app"'))
            await conn.run_sync(
                lambda c: Base.metadata.create_all(c, checkfirst=True)
            )
    elif dialect == "oracle":
        # Oracle usa user-schema. O Base.metadata.schema é ``"app"`` (ver
        # ``app/db/base.py``); mapeamos pra usuário atual via
        # ``schema_translate_map``. Em Oracle, schema None = CURRENT_SCHEMA.
        async with engine.begin() as conn:
            conn = await conn.execution_options(
                schema_translate_map={"app": None},
            )
            await conn.run_sync(
                lambda c: Base.metadata.create_all(c, checkfirst=True)
            )
    else:
        raise NotImplementedError(f"Dialect não suportado: {dialect}")

    log.info("app_schema_created", dialect=dialect)

    counts: dict[str, int | str] = {"dialect": dialect}
    if apply_seeds:
        # Em Oracle precisamos do ``schema_translate_map`` na engine
        # (metadata declara ``schema="app"``; em Oracle a tabela mora no
        # user ativo, então "app" → None).
        seed_engine = (
            engine.execution_options(schema_translate_map={"app": None})
            if dialect == "oracle"
            else engine
        )
        async with AsyncSession(seed_engine) as session:
            seed_counts = await apply_all_seeds(session)
            await session.commit()
            counts.update(seed_counts)
    return counts
