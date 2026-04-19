"""Resolução e render do ``EmailTemplateService``."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.email_templates.models import (
    SYSTEM_SCOPE_ID,
    EmailTemplate,
    TemplateScope,
)
from app.modules.email_templates.service import EmailTemplateService


@pytest.fixture
def password_reset_ctx() -> dict:
    return {
        "app_name": "zSaúde",
        "user_name": "Igor",
        "reset_link": "https://zsaude.test/redefinir-senha?token=ABC",
        "expires_in_minutes": 15,
    }


async def test_fallback_to_file_when_no_db_row(db_session: AsyncSession, password_reset_ctx):
    svc = EmailTemplateService(db_session)
    res = await svc.render("password_reset", password_reset_ctx)
    assert res.subject == "Redefinição de senha"
    assert res.html is not None and "Igor" in res.html
    assert res.text is not None and "Igor" in res.text
    assert res.from_name is None


async def test_system_override_wins(db_session: AsyncSession, password_reset_ctx):
    row = EmailTemplate(
        code="password_reset",
        scope_type=TemplateScope.SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        subject="Override {{ app_name }}",
        body_html="<p>HTML override — {{ user_name }}</p>",
        body_text="TXT override — {{ user_name }}",
        from_name="zSaúde Suporte",
        is_active=True,
    )
    db_session.add(row)
    await db_session.commit()

    svc = EmailTemplateService(db_session)
    res = await svc.render("password_reset", password_reset_ctx)
    assert res.subject == "Override zSaúde"
    assert res.html is not None and "HTML override" in res.html
    assert res.text is not None and "TXT override" in res.text
    assert res.from_name == "zSaúde Suporte"


async def test_municipality_override_beats_system(db_session: AsyncSession, password_reset_ctx):
    mun_id = uuid.uuid4()
    db_session.add_all([
        EmailTemplate(
            code="password_reset",
            scope_type=TemplateScope.SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            subject="SYSTEM {{ app_name }}",
            body_text="sys",
            is_active=True,
        ),
        EmailTemplate(
            code="password_reset",
            scope_type=TemplateScope.MUNICIPALITY,
            scope_id=mun_id,
            subject="MUN {{ user_name }}",
            body_text="mun",
            is_active=True,
        ),
    ])
    await db_session.commit()

    svc = EmailTemplateService(db_session)
    res = await svc.render(
        "password_reset", password_reset_ctx, municipality_id=mun_id,
    )
    assert res.subject == "MUN Igor"
    assert res.text == "mun"


async def test_facility_override_beats_municipality(db_session: AsyncSession, password_reset_ctx):
    mun_id, fac_id = uuid.uuid4(), uuid.uuid4()
    db_session.add_all([
        EmailTemplate(
            code="password_reset",
            scope_type=TemplateScope.MUNICIPALITY,
            scope_id=mun_id,
            subject="MUN",
            body_text="mun",
            is_active=True,
        ),
        EmailTemplate(
            code="password_reset",
            scope_type=TemplateScope.FACILITY,
            scope_id=fac_id,
            subject="FAC",
            body_text="fac",
            is_active=True,
        ),
    ])
    await db_session.commit()

    svc = EmailTemplateService(db_session)
    res = await svc.render(
        "password_reset", password_reset_ctx,
        municipality_id=mun_id, facility_id=fac_id,
    )
    assert res.subject == "FAC"
    assert res.text == "fac"


async def test_inactive_row_is_ignored(db_session: AsyncSession, password_reset_ctx):
    db_session.add(
        EmailTemplate(
            code="password_reset",
            scope_type=TemplateScope.SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            subject="INACTIVE",
            body_text="x",
            is_active=False,
        )
    )
    await db_session.commit()

    svc = EmailTemplateService(db_session)
    res = await svc.render("password_reset", password_reset_ctx)
    # Cai no fallback de arquivo — assunto veio do catálogo.
    assert res.subject == "Redefinição de senha"


async def test_unknown_code_raises(db_session: AsyncSession):
    svc = EmailTemplateService(db_session)
    with pytest.raises(ValueError, match="não existe no catálogo"):
        await svc.render("inexistente", {})
