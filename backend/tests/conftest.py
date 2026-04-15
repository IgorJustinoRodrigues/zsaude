"""Fixtures globais: Postgres via testcontainers + httpx async client + sessão seedada."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

from app.db.base import Base
from app.db import models_registry  # noqa: F401


@pytest.fixture(scope="session")
def postgres_container() -> PostgresContainer:
    container = PostgresContainer("postgres:17-alpine")
    container.start()
    yield container
    container.stop()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _setup_db(postgres_container: PostgresContainer):
    url = postgres_container.get_connection_url().replace("postgresql+psycopg2", "postgresql+asyncpg")
    os.environ["DATABASE_URL"] = url
    # não usamos valkey nos testes básicos
    os.environ.setdefault("PASSWORD_PEPPER", "test-pepper-that-is-long-enough-to-pass-validation-xxxx")
    # JWT keys temporárias (geradas inline)
    _ensure_test_keys()

    engine = create_async_engine(url, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


def _ensure_test_keys() -> None:
    from pathlib import Path

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    secrets = Path("secrets")
    secrets.mkdir(exist_ok=True)
    priv = secrets / "jwt_private.pem"
    pub = secrets / "jwt_public.pem"
    if not priv.exists():
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        priv.write_bytes(
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        pub.write_bytes(
            key.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )
    os.environ["JWT_PRIVATE_KEY_PATH"] = str(priv.resolve())
    os.environ["JWT_PUBLIC_KEY_PATH"] = str(pub.resolve())


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(os.environ["DATABASE_URL"], future=True)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()
