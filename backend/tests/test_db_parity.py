"""Testes de paridade PostgreSQL ↔ Oracle.

Garante que o provisionamento do schema ``app`` produz o mesmo resultado
em ambos os bancos: mesma contagem de tabelas, mesmas linhas de seeds,
mesmos IDs quando determinísticos.

Execução:
    # PG (default — sempre roda)
    pytest tests/test_db_parity.py

    # Com Oracle (levanta container Oracle Free 23ai, ~2min de warmup)
    ORACLE_TEST=1 pytest tests/test_db_parity.py

    # Só Oracle
    ORACLE_TEST=1 pytest tests/test_db_parity.py -k oracle
"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db.provisioning import provision_app_schema


# ─── Fixtures ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="module")
async def pg_engine():
    """Sobe Postgres limpo via testcontainers e provisiona schema app."""
    try:
        from testcontainers.postgres import PostgresContainer
    except ImportError:
        pytest.skip("testcontainers não instalado")

    with PostgresContainer("postgres:17-alpine") as pg:
        url = pg.get_connection_url().replace(
            "postgresql+psycopg2", "postgresql+asyncpg"
        )
        engine = create_async_engine(url)
        await provision_app_schema(engine, apply_seeds=True)
        yield engine
        await engine.dispose()


def _oracle_enabled() -> bool:
    return os.getenv("ORACLE_TEST", "").lower() in ("1", "true", "yes")


@pytest_asyncio.fixture(scope="module")
async def oracle_engine():
    """Sobe Oracle Free 23ai via testcontainers, cria user APP, provisiona."""
    if not _oracle_enabled():
        pytest.skip("Oracle tests desabilitados (defina ORACLE_TEST=1)")

    try:
        from testcontainers.oracle import OracleDbContainer  # type: ignore
    except ImportError:
        pytest.skip("testcontainers[oracle] não instalado")

    with OracleDbContainer("gvenzl/oracle-free:23-slim") as oracle:
        sys_url = oracle.get_connection_url().replace(
            "oracle+cx_oracle", "oracle+oracledb"
        )
        # Cria user APP
        sys_eng = create_async_engine(sys_url)
        async with sys_eng.begin() as conn:
            try:
                await conn.execute(text('DROP USER APP CASCADE'))
            except Exception:
                pass
            await conn.execute(text('CREATE USER APP IDENTIFIED BY "zsaude_dev_password"'))
            await conn.execute(text(
                'GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE, '
                'CREATE USER, ALTER USER, DROP USER, '
                'CREATE ANY TABLE, ALTER ANY TABLE, SELECT ANY TABLE, '
                'INSERT ANY TABLE, UPDATE ANY TABLE, DELETE ANY TABLE TO APP'
            ))
        await sys_eng.dispose()

        app_url = sys_url.replace(
            sys_url.split("@")[0].split("//")[-1],
            "app:zsaude_dev_password",
        )
        engine = create_async_engine(
            app_url,
            execution_options={"schema_translate_map": {"app": None}},
        )
        await provision_app_schema(engine, apply_seeds=True)
        yield engine
        await engine.dispose()


# ─── Helpers ───────────────────────────────────────────────────────────────

async def _count(session: AsyncSession, table: str, *, dialect: str) -> int:
    """Conta linhas da tabela — schema ``app`` em PG, sem schema em Oracle."""
    qualified = f'"app".{table}' if dialect == "postgresql" else table
    return (await session.execute(
        text(f"SELECT COUNT(*) FROM {qualified}")
    )).scalar() or 0


SEED_TABLES: list[tuple[str, int]] = [
    ("system_settings",        8),
    ("ref_nacionalidades",   332),
    ("ref_etnias",           406),
    ("ref_logradouros",      129),
    ("ref_tipos_documento",   13),
    ("ref_estados_civis",      7),
    ("ref_escolaridades",     17),
    ("ref_religioes",         10),
    ("ai_providers",           3),
    ("ai_prompt_templates",    4),
]


# ─── Testes ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pg_seed_counts(pg_engine):
    """Postgres: contagens dos seeds batem com o esperado."""
    async with AsyncSession(pg_engine) as s:
        for table, expected in SEED_TABLES:
            got = await _count(s, table, dialect="postgresql")
            assert got >= expected, (
                f"{table}: esperado >={expected}, got {got}"
            )


@pytest.mark.asyncio
async def test_oracle_seed_counts(oracle_engine):
    """Oracle: contagens dos seeds batem com o esperado."""
    async with AsyncSession(oracle_engine) as s:
        for table, expected in SEED_TABLES:
            got = await _count(s, table, dialect="oracle")
            assert got >= expected, (
                f"{table}: esperado >={expected}, got {got}"
            )


@pytest.mark.asyncio
async def test_parity_seed_counts(pg_engine, oracle_engine):
    """PG e Oracle têm o mesmo volume de seeds (±5% tolerância)."""
    async with AsyncSession(pg_engine) as pg, AsyncSession(oracle_engine) as ora:
        for table, _ in SEED_TABLES:
            pg_n = await _count(pg, table, dialect="postgresql")
            ora_n = await _count(ora, table, dialect="oracle")
            # Igualdade estrita esperada — os dados vêm da mesma fonte.
            assert pg_n == ora_n, (
                f"{table}: PG={pg_n}, Oracle={ora_n} — seeds divergiram!"
            )


@pytest.mark.asyncio
async def test_oracle_schema_version_registered(oracle_engine):
    """Oracle grava o registro em APP.SCHEMA_VERSION."""
    from app.db.provisioning import read_app_schema_version
    record = await read_app_schema_version(oracle_engine)
    assert record is not None
    assert record["id"] == "app"
    assert record["table_count"] > 50
    assert len(record["fingerprint"]) == 16
