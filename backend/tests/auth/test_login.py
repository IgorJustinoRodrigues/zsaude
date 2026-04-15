"""Smoke tests do fluxo de login/refresh/logout."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.modules.users.models import User, UserStatus


@pytest.fixture
async def user(db_session) -> User:
    u = User(
        id=uuid.uuid4(),
        login="alice",
        email="alice@example.com",
        name="Alice",
        cpf="39053344705",
        phone="",
        password_hash=hash_password("Secret123!"),
        status=UserStatus.ATIVO,
        is_active=True,
        primary_role="Tester",
    )
    db_session.add(u)
    await db_session.commit()
    return u


async def test_login_success(client: AsyncClient, user: User) -> None:
    resp = await client.post("/api/v1/auth/login", json={"login": "alice", "password": "Secret123!"})
    assert resp.status_code == 200
    data = resp.json()
    assert "accessToken" in data
    assert "refreshToken" in data
    assert data["tokenType"] == "Bearer"


async def test_login_wrong_password(client: AsyncClient, user: User) -> None:
    resp = await client.post("/api/v1/auth/login", json={"login": "alice", "password": "wrong"})
    assert resp.status_code == 401


async def test_refresh_rotates(client: AsyncClient, user: User) -> None:
    r1 = await client.post("/api/v1/auth/login", json={"login": "alice", "password": "Secret123!"})
    refresh1 = r1.json()["refreshToken"]

    r2 = await client.post("/api/v1/auth/refresh", json={"refreshToken": refresh1})
    assert r2.status_code == 200
    refresh2 = r2.json()["refreshToken"]
    assert refresh1 != refresh2

    # reusar o primeiro deve falhar e matar a família
    r3 = await client.post("/api/v1/auth/refresh", json={"refreshToken": refresh1})
    assert r3.status_code == 401

    # o "novo" também não vale mais — família revogada
    r4 = await client.post("/api/v1/auth/refresh", json={"refreshToken": refresh2})
    assert r4.status_code == 401


async def test_me_requires_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_me_with_token(client: AsyncClient, user: User) -> None:
    r1 = await client.post("/api/v1/auth/login", json={"login": "alice", "password": "Secret123!"})
    access = r1.json()["accessToken"]

    r2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert r2.status_code == 200
    assert r2.json()["login"] == "alice"
