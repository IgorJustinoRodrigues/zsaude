"""Integração do endpoint de forgot-password com o EmailService."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.email import NullEmailService, get_email_service, reset_email_service_cache
from app.core.security import hash_password
from app.modules.users.models import User, UserStatus


@pytest.fixture
async def user(db_session) -> User:
    u = User(
        id=uuid.uuid4(),
        login="marta",
        email="marta@example.com",
        name="Marta",
        cpf="52998224725",
        phone="",
        password_hash=hash_password("Secret123!"),
        status=UserStatus.ATIVO,
        is_active=True,
        primary_role="Tester",
    )
    db_session.add(u)
    await db_session.commit()
    return u


async def test_forgot_password_sends_email(user: User) -> None:
    from app.main import create_app

    reset_email_service_cache()
    captured = NullEmailService()

    app = create_app()
    app.dependency_overrides[get_email_service] = lambda: captured

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            "/api/v1/auth/forgot-password",
            json={"email": "marta@example.com"},
        )

    assert resp.status_code == 200
    assert "Se o e-mail existir" in resp.json()["message"]
    assert len(captured.outbox) == 1
    sent = captured.outbox[0]
    assert sent.to == ["marta@example.com"]
    assert sent.subject == "Redefinição de senha"
    assert sent.tags.get("category") == "password_reset"
    # O link deve apontar pro frontend com token na query.
    assert sent.html is not None
    assert "/redefinir-senha?token=" in sent.html
    assert sent.text is not None
    assert "/redefinir-senha?token=" in sent.text


async def test_forgot_password_unknown_email_is_silent(db_session) -> None:
    from app.main import create_app

    reset_email_service_cache()
    captured = NullEmailService()

    app = create_app()
    app.dependency_overrides[get_email_service] = lambda: captured

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            "/api/v1/auth/forgot-password",
            json={"email": "ninguem@example.com"},
        )

    # Resposta idêntica (não revela existência). Nenhum e-mail foi disparado.
    assert resp.status_code == 200
    assert captured.outbox == []
