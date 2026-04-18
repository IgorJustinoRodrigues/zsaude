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
    """Provisiona o tenant Oracle sem Alembic.

    Em Oracle, schema = user. Para ``metadata.create_all`` criar as tabelas
    com *owner* correto (``MUN_XXX``), conectamos **diretamente como o user
    do tenant** em vez de usar ``ALTER SESSION SET CURRENT_SCHEMA`` sob o
    usuário admin — o ``CURRENT_SCHEMA`` muda o schema default mas o DDL
    continua criando com ``owner = user_logado``, quebrando FKs internas.

    Fluxo: deriva a URL do tenant a partir de ``settings.database_url``
    substituindo o user/pwd pelo do tenant (senha idêntica ao user admin
    por convenção em dev — produção deve gerenciar via Vault/Secrets).
    """
    from sqlalchemy.ext.asyncio import create_async_engine as _create
    from urllib.parse import urlparse, urlunparse

    from app.core.config import settings as app_settings
    from app.db.dialect import get_adapter
    from app.tenant_models import TenantBase
    import app.tenant_models._registry  # noqa: F401 - popula metadata

    # Reconstrói a URL trocando user/pwd pelo do tenant. A senha vem da
    # convenção ``CREATE USER ... IDENTIFIED BY <mesma senha do admin>``
    # usada em dev; em prod o admin passa a senha real aqui.
    parsed = urlparse(app_settings.database_url)
    tenant_user = schema.upper()
    tenant_pwd = parsed.password or "zsaude_dev_password"
    new_netloc = f"{tenant_user}:{tenant_pwd}@{parsed.hostname}"
    if parsed.port:
        new_netloc += f":{parsed.port}"
    tenant_url = urlunparse(parsed._replace(netloc=new_netloc))

    tmp_eng = _create(tenant_url, pool_size=1, max_overflow=0)

    adapter = get_adapter("oracle")
    vector_index_sql = adapter.create_vector_index_sql(
        index_name="ix_pfe_embedding_hnsw",
        table="patient_face_embeddings",
        column="embedding",
        distance="cosine",
    )

    def _do_create(connection):
        from app.db.schema_migrator import evolve_schema

        count_tables = connection.execute(
            text("SELECT COUNT(*) FROM user_tables"),
        ).scalar() or 0

        if count_tables == 0:
            TenantBase.metadata.create_all(connection)
            try:
                connection.execute(text(vector_index_sql))
            except Exception as e:  # noqa: BLE001 - índice é opcional pra startup
                log.warning(
                    "tenant_vector_index_create_failed",
                    schema=schema,
                    error=str(e),
                )
        else:
            # Já existe — aplica diff pra pegar colunas novas nos models.
            result = evolve_schema(connection, TenantBase.metadata)
            if result.added_columns:
                log.info(
                    "tenant_schema_evolved",
                    schema=schema,
                    added=result.added_columns,
                )
            if result.warnings:
                for w in result.warnings:
                    log.warning("tenant_evolve_warning", schema=schema, msg=w)

    try:
        async with tmp_eng.begin() as conn:
            await conn.run_sync(_do_create)
        log.info("tenant_tables_created_oracle", schema=schema)
    finally:
        await tmp_eng.dispose()

    # Registra versão do tenant em APP.SCHEMA_VERSION — conecta com o user
    # admin (da URL original) que tem privilégio de escrever em APP.*.
    from app.db.schema_version import compute_fingerprint, write_schema_record
    admin_eng = _create(
        app_settings.database_url,
        pool_size=1, max_overflow=0,
        execution_options={"schema_translate_map": {"app": None}},
    )
    try:
        async with admin_eng.begin() as conn:
            await conn.run_sync(
                lambda c: write_schema_record(
                    c, schema,
                    fingerprint=compute_fingerprint(TenantBase.metadata),
                    table_count=len(TenantBase.metadata.tables),
                    details={"kind": "tenant", "vector_index": "ix_pfe_embedding_hnsw"},
                )
            )
    except Exception as e:  # noqa: BLE001
        log.warning("schema_version_record_failed", schema=schema, error=str(e))
    finally:
        await admin_eng.dispose()


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
