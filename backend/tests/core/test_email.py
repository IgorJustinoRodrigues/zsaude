"""Smoke tests do EmailService genérico e do renderizador de templates."""

from __future__ import annotations

import pytest

from app.core.email import (
    Attachment,
    EmailMessage,
    NullEmailService,
    _build_mime,
)
from app.core.email_templates import render, render_string


async def test_null_service_captures_message() -> None:
    svc = NullEmailService()
    msg = EmailMessage(
        to=["alice@example.com"],
        subject="Assunto",
        text="corpo texto",
    )
    message_id = await svc.send(msg)
    assert message_id.startswith("null-")
    assert len(svc.outbox) == 1
    assert svc.outbox[0].to == ["alice@example.com"]
    assert svc.outbox[0].subject == "Assunto"


def test_message_requires_body() -> None:
    with pytest.raises(ValueError, match="html ou text"):
        EmailMessage(to=["a@b.com"], subject="x")


def test_message_requires_recipient() -> None:
    with pytest.raises(ValueError, match="destinatário"):
        EmailMessage(to=[], subject="x", text="y")


def test_build_mime_multipart_and_attachment() -> None:
    msg = EmailMessage(
        to=["alice@example.com", "bob@example.com"],
        cc=["cc@example.com"],
        subject="Relatório",
        html="<p>olá</p>",
        text="olá",
        attachments=[Attachment(filename="r.pdf", content=b"%PDF-1.4", mime="application/pdf")],
        tags={"category": "report"},
    )
    mime = _build_mime(msg)
    assert mime["To"].startswith("alice@example.com")
    assert mime["Cc"] == "cc@example.com"
    assert mime["Subject"] == "Relatório"
    assert mime["X-Email-Tag-category"] == "report"
    parts = list(mime.walk())
    filenames = [p.get_filename() for p in parts if p.get_filename()]
    assert "r.pdf" in filenames


def test_render_password_reset_template() -> None:
    html, text = render(
        "password_reset",
        {
            "app_name": "zSaúde",
            "user_name": "Igor",
            "reset_link": "https://zsaude.test/redefinir-senha?token=ABC",
            "expires_in_minutes": 15,
        },
    )
    assert html is not None and text is not None
    assert "Igor" in html and "Igor" in text
    assert "https://zsaude.test/redefinir-senha?token=ABC" in html
    assert "15" in text


def test_render_string_autoescapes_html() -> None:
    out = render_string("Oi <b>{{ name }}</b>", {"name": "<script>"})
    assert "&lt;script&gt;" in out
    assert "<script>" not in out


def test_render_string_plain_no_autoescape() -> None:
    out = render_string("Oi {{ name }}", {"name": "<script>"}, autoescape=False)
    assert out == "Oi <script>"


def test_render_missing_variable_fails_fast() -> None:
    from jinja2 import UndefinedError

    with pytest.raises(UndefinedError):
        render_string("oi {{ missing }}", {})
