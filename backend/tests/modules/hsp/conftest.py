"""Fixtures para testes do PatientService.

Cria um schema de município dedicado, monta as tabelas do TenantBase nele e
devolve uma sessão com ``search_path`` apontando para ``mun_test, app, public``.

Se ``DATABASE_URL`` já estiver no ambiente (ex.: rodando no container app
contra o Postgres do docker-compose), reaproveita. Caso contrário cai nos
fixtures do ``tests/conftest.py`` raiz que usa testcontainers.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.deps import WorkContext
from app.modules.permissions.service import ResolvedPermissions
from app.tenant_models import TenantBase
from app.tenant_models._registry import Patient, PatientFieldHistory, PatientPhoto  # noqa: F401

_TEST_SCHEMA = "mun_9999999"


# Se um DATABASE_URL já estiver definido, pulamos o setup do conftest raiz
# (que tenta subir testcontainers). Sobrescrevemos com fixtures no-op.
if os.environ.get("DATABASE_URL"):
    @pytest.fixture(scope="session")
    def postgres_container():  # type: ignore[override]
        yield None

    @pytest.fixture(scope="session", autouse=True)
    def _setup_db(postgres_container):  # type: ignore[override]
        # Assume schema `app` já existente (docker-compose inicializa).
        yield


@pytest_asyncio.fixture
async def tenant_session() -> AsyncIterator[AsyncSession]:
    """Sessão com search_path no schema de teste. Recria as tabelas a cada teste."""
    engine = create_async_engine(os.environ["DATABASE_URL"], future=True)

    # Cria schema limpo a cada teste (DROP + CREATE).
    async with engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{_TEST_SCHEMA}" CASCADE'))
        await conn.execute(text(f'CREATE SCHEMA "{_TEST_SCHEMA}"'))
        await conn.execute(text(f'SET search_path TO "{_TEST_SCHEMA}", "app", "public"'))
        await conn.run_sync(TenantBase.metadata.create_all)

    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        await s.execute(text(f'SET search_path TO "{_TEST_SCHEMA}", "app", "public"'))
        yield s

    async with engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{_TEST_SCHEMA}" CASCADE'))
    await engine.dispose()


def make_work_context(user_id: uuid.UUID | None = None) -> WorkContext:
    """WorkContext fake — suficiente pro service (user_id + role)."""
    return WorkContext(
        user_id=user_id or uuid.uuid4(),
        municipality_id=uuid.uuid4(),
        municipality_ibge="9999999",
        facility_id=uuid.uuid4(),
        facility_access_id=None,
        role="tester",
        modules=["hsp"],
        permissions=ResolvedPermissions(codes=frozenset(), is_root=True),
    )
