"""Modelo ``EmailTemplate`` — overrides de template por escopo."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UUIDType, new_uuid7

# Sentinela usada em ``scope_id`` quando o escopo é SYSTEM — evita nullable
# em unique constraint (Postgres e Oracle não tratam NULL de forma idêntica
# nesses casos).
SYSTEM_SCOPE_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")


class TemplateScope(str, enum.Enum):
    SYSTEM = "system"
    MUNICIPALITY = "municipality"
    FACILITY = "facility"


class EmailTemplate(Base):
    """Override de template de e-mail.

    A resolução em runtime é ``FACILITY → MUNICIPALITY → SYSTEM (db) →
    arquivo``. Não existir linha aqui não quebra nada — os templates de
    arquivo em ``app/templates/email/`` permanecem como default.
    """

    __tablename__ = "email_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    code: Mapped[str] = mapped_column(String(64), nullable=False)

    scope_type: Mapped[TemplateScope] = mapped_column(
        Enum(
            TemplateScope,
            name="email_template_scope",
            native_enum=False,
            length=20,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    scope_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False)

    # Subject em Jinja2 (suporta variáveis). Texto curto. Render com autoescape=False.
    subject: Mapped[str] = mapped_column(String(255), nullable=False, server_default=" ")
    # Corpos em Jinja2. HTML com autoescape=True, texto sem escape.
    body_html: Mapped[str | None] = mapped_column(Text(), nullable=True)
    body_text: Mapped[str | None] = mapped_column(Text(), nullable=True)
    # Opcional: sobrescreve o nome do remetente ("Prefeitura de X" etc.).
    from_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean(), nullable=False, server_default=text("TRUE"))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        UniqueConstraint("code", "scope_type", "scope_id", name="uq_email_templates_scope"),
        CheckConstraint(
            "scope_type IN ('system', 'municipality', 'facility')",
            name="ck_email_templates_scope_type",
        ),
    )
