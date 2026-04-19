"""CRUD de templates de e-mail."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select

from app.modules.email_templates.models import (
    SYSTEM_SCOPE_ID,
    EmailTemplate,
    TemplateScope,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class EmailTemplateRepository:
    def __init__(self, session: "AsyncSession") -> None:
        self.session = session

    async def get_one(
        self, code: str, scope_type: TemplateScope, scope_id: UUID,
    ) -> EmailTemplate | None:
        return await self.session.scalar(
            select(EmailTemplate).where(
                EmailTemplate.code == code,
                EmailTemplate.scope_type == scope_type,
                EmailTemplate.scope_id == scope_id,
            )
        )

    async def list_by_scope(
        self, scope_type: TemplateScope, scope_id: UUID | None,
    ) -> list[EmailTemplate]:
        """Lista todos os overrides de um escopo específico.

        Pra escopo SYSTEM, ``scope_id`` deve ser ``SYSTEM_SCOPE_ID`` (ou
        ``None``, que esta função normaliza).
        """
        sid = scope_id or SYSTEM_SCOPE_ID if scope_type == TemplateScope.SYSTEM else scope_id
        if sid is None:
            raise ValueError("scope_id obrigatório para municipality/facility.")
        rows = await self.session.scalars(
            select(EmailTemplate)
            .where(
                EmailTemplate.scope_type == scope_type,
                EmailTemplate.scope_id == sid,
            )
            .order_by(EmailTemplate.code)
        )
        return list(rows.all())

    async def upsert(
        self,
        code: str,
        scope_type: TemplateScope,
        scope_id: UUID,
        *,
        subject: str,
        body_html: str | None,
        body_text: str | None,
        from_name: str | None,
        is_active: bool,
    ) -> EmailTemplate:
        existing = await self.get_one(code, scope_type, scope_id)
        if existing is not None:
            existing.subject = subject
            existing.body_html = body_html
            existing.body_text = body_text
            existing.from_name = from_name
            existing.is_active = is_active
            await self.session.flush()
            return existing
        row = EmailTemplate(
            code=code,
            scope_type=scope_type,
            scope_id=scope_id,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            from_name=from_name,
            is_active=is_active,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def delete(
        self, code: str, scope_type: TemplateScope, scope_id: UUID,
    ) -> bool:
        row = await self.get_one(code, scope_type, scope_id)
        if row is None:
            return False
        await self.session.delete(row)
        await self.session.flush()
        return True
