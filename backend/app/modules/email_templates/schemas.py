"""Schemas Pydantic do módulo de templates de e-mail."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TemplateVariableRead(BaseModel):
    name: str
    description: str
    example: str


class TemplateCatalogRead(BaseModel):
    """Item do catálogo. Pra UI listar códigos + variáveis de cada um."""

    code: str
    label: str
    description: str
    default_subject: str = Field(alias="defaultSubject")
    variables: list[TemplateVariableRead]

    model_config = ConfigDict(populate_by_name=True)


ScopeType = Literal["system", "municipality", "facility"]


class EmailTemplateRead(BaseModel):
    """Linha gravada na tabela ``email_templates``."""

    id: UUID
    code: str
    scope_type: ScopeType = Field(alias="scopeType")
    scope_id: UUID = Field(alias="scopeId")
    subject: str
    body_html: str | None = Field(default=None, alias="bodyHtml")
    body_text: str | None = Field(default=None, alias="bodyText")
    from_name: str | None = Field(default=None, alias="fromName")
    is_active: bool = Field(alias="isActive")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class EmailTemplateUpsert(BaseModel):
    """Body do PUT ``/email-templates/{code}``.

    ``scope_type='system'`` ignora ``scope_id`` (usa sentinela). Os demais
    exigem ``scope_id``.
    """

    scope_type: ScopeType = Field(alias="scopeType")
    scope_id: UUID | None = Field(default=None, alias="scopeId")
    subject: str = Field(min_length=1, max_length=255)
    body_html: str | None = Field(default=None, alias="bodyHtml")
    body_text: str | None = Field(default=None, alias="bodyText")
    from_name: str | None = Field(default=None, max_length=200, alias="fromName")
    is_active: bool = Field(default=True, alias="isActive")

    model_config = ConfigDict(populate_by_name=True)


class EmailTemplatePreviewRequest(BaseModel):
    """Body pra ``POST /preview``. Se ``source`` vier, rende o source direto;
    senão pega o que está no banco (resolução em cascata).
    """

    subject: str | None = None
    body_html: str | None = Field(default=None, alias="bodyHtml")
    body_text: str | None = Field(default=None, alias="bodyText")
    # Contexto override (por default usa example do catálogo)
    context: dict | None = None
    scope_type: ScopeType | None = Field(default=None, alias="scopeType")
    scope_id: UUID | None = Field(default=None, alias="scopeId")

    model_config = ConfigDict(populate_by_name=True)


class EmailTemplatePreviewResponse(BaseModel):
    subject: str
    body_html: str | None = Field(default=None, alias="bodyHtml")
    body_text: str | None = Field(default=None, alias="bodyText")
    from_name: str | None = Field(default=None, alias="fromName")
    from_email: str | None = Field(default=None, alias="fromEmail")
    # Indica de qual escopo as credenciais vieram ('system'|'municipality'|
    # 'facility'|'env'). Útil pra deixar óbvio no preview.
    credentials_source: str | None = Field(default=None, alias="credentialsSource")

    model_config = ConfigDict(populate_by_name=True)
