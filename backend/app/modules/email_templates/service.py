"""Serviço de resolução de templates de e-mail com herança de escopo.

Regra: FACILITY → MUNICIPALITY → SYSTEM (banco) → arquivo embarcado em
``app/templates/email/<code>.{html,txt}``. Pra chamadores, expõe uma única
API:

    resolved = await svc.render(
        "password_reset",
        context={"user_name": "Igor", ...},
        municipality_id=None,
        facility_id=None,
    )
    # → RenderedMessage(subject=..., html=..., text=..., from_name=...)

A resolução é read-only; edição via UI vem na próxima iteração.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select

from app.core.email_templates import render as render_file_template, render_string
from app.core.logging import get_logger
from app.modules.email_templates.catalog import get_entry
from app.modules.email_templates.models import (
    SYSTEM_SCOPE_ID,
    EmailTemplate,
    TemplateScope,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)


@dataclass(slots=True)
class RenderedMessage:
    subject: str
    html: str | None
    text: str | None
    from_name: str | None


class EmailTemplateService:
    def __init__(self, session: "AsyncSession") -> None:
        self.session = session

    # ── Resolução ─────────────────────────────────────────────────────────

    async def resolve_row(
        self,
        code: str,
        *,
        municipality_id: UUID | None = None,
        facility_id: UUID | None = None,
    ) -> EmailTemplate | None:
        """Busca a linha mais específica aplicável.

        Cascata: FACILITY > MUNICIPALITY > SYSTEM. Ignora linhas com
        ``is_active=False``.
        """
        candidates: list[tuple[TemplateScope, UUID]] = []
        if facility_id is not None:
            candidates.append((TemplateScope.FACILITY, facility_id))
        if municipality_id is not None:
            candidates.append((TemplateScope.MUNICIPALITY, municipality_id))
        candidates.append((TemplateScope.SYSTEM, SYSTEM_SCOPE_ID))

        for scope_type, scope_id in candidates:
            row = await self.session.scalar(
                select(EmailTemplate).where(
                    EmailTemplate.code == code,
                    EmailTemplate.scope_type == scope_type,
                    EmailTemplate.scope_id == scope_id,
                    EmailTemplate.is_active.is_(True),
                )
            )
            if row is not None:
                return row
        return None

    async def render(
        self,
        code: str,
        context: dict,
        *,
        municipality_id: UUID | None = None,
        facility_id: UUID | None = None,
    ) -> RenderedMessage:
        """Resolve e renderiza o template com o ``context`` dado.

        Se não há override no banco, cai pros templates de arquivo em
        ``app/templates/email/<code>.{html,txt}`` e pro ``default_subject``
        do catálogo.
        """
        entry = get_entry(code)

        row = await self.resolve_row(
            code, municipality_id=municipality_id, facility_id=facility_id,
        )
        if row is not None:
            subject = render_string(row.subject, context, autoescape=False)
            html = (
                render_string(row.body_html, context, autoescape=True)
                if row.body_html
                else None
            )
            text = (
                render_string(row.body_text, context, autoescape=False)
                if row.body_text
                else None
            )
            return RenderedMessage(
                subject=subject, html=html, text=text, from_name=row.from_name,
            )

        # Fallback: arquivo + default_subject do catálogo.
        html, text = render_file_template(code, context)
        if entry is None:
            raise ValueError(
                f"Template '{code}' não existe no catálogo e não há override no banco.",
            )
        subject = render_string(entry.default_subject, context, autoescape=False)
        return RenderedMessage(subject=subject, html=html, text=text, from_name=None)
