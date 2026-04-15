"""Schemas de usuário."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.core.schema_base import CamelModel


class UserRead(CamelModel):
    id: UUID
    login: str
    email: EmailStr
    name: str
    cpf: str
    phone: str
    status: str
    primary_role: str
    birth_date: date | None = None
    created_at: datetime


class UserUpdateMe(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
