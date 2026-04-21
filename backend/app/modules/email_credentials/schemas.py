"""Schemas Pydantic das credenciais de envio."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, EmailStr, Field

from app.core.schema_base import CamelModel

ScopeType = Literal["system", "municipality", "facility"]


class EmailCredentialsRead(CamelModel):
    """Leitura — o ``awsSecretAccessKey`` nunca retorna em claro.

    ``awsSecretSet`` indica se há um valor gravado (pra UI mostrar "já
    configurado" sem revelar).
    """

    id: UUID
    scope_type: ScopeType
    scope_id: UUID
    from_email: EmailStr
    from_name: str = ""
    aws_region: str
    aws_access_key_id: str
    aws_secret_set: bool = True
    ses_configuration_set: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class EmailCredentialsUpsert(CamelModel):
    """Body do PUT. ``awsSecretAccessKey`` é opcional no update — se
    omitido, mantém o valor atual no banco (só UPDATE sem trocar a secret).
    Na criação ele é obrigatório.
    """

    scope_type: ScopeType
    scope_id: UUID | None = None
    from_email: EmailStr
    from_name: str = Field(default="", max_length=200)
    aws_region: str = Field(default="us-east-1", max_length=32)
    aws_access_key_id: str = Field(min_length=10, max_length=200)
    aws_secret_access_key: str | None = Field(default=None, max_length=200)
    ses_configuration_set: str | None = Field(default=None, max_length=200)
    is_active: bool = True


class EmailCredentialsTestRequest(CamelModel):
    """Envio de teste. Valida as creds **do body** se vierem; senão,
    usa as já gravadas no escopo.
    """

    to: EmailStr
    scope_type: ScopeType = "system"
    scope_id: UUID | None = None


class EmailCredentialsTestResponse(CamelModel):
    ok: bool
    message_id: str | None = None
    error: str | None = None
    source: str  # facility|municipality|system|env
    from_email: str
