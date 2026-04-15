"""Schemas de usuário."""

from __future__ import annotations

from datetime import date, datetime

from typing import Literal
from uuid import UUID

from pydantic import EmailStr, Field, field_validator

from app.core.schema_base import CamelModel
from app.core.validators import validate_cpf

UserStatusLiteral = Literal["Ativo", "Inativo", "Bloqueado"]


class UserRead(CamelModel):
    """Perfil completo (para /auth/me e /users/me)."""

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


class UserListItem(CamelModel):
    """Item da listagem. Inclui resumo: total de municípios e módulos."""

    id: UUID
    login: str
    email: EmailStr
    name: str
    cpf: str
    phone: str
    status: str
    primary_role: str
    created_at: datetime
    municipality_count: int
    facility_count: int
    modules: list[str]


class FacilityAccessInput(CamelModel):
    facility_id: UUID
    role: str = Field(min_length=2, max_length=100)
    modules: list[str] = Field(default_factory=list)


class MunicipalityAccessInput(CamelModel):
    municipality_id: UUID
    facilities: list[FacilityAccessInput] = Field(default_factory=list)


class FacilityAccessDetail(CamelModel):
    facility_id: UUID
    facility_name: str
    facility_short_name: str
    facility_type: str
    role: str
    modules: list[str]


class MunicipalityAccessDetail(CamelModel):
    municipality_id: UUID
    municipality_name: str
    municipality_state: str
    facilities: list[FacilityAccessDetail]


class UserDetail(CamelModel):
    """Perfil detalhado para a tela de visualização administrativa."""

    id: UUID
    login: str
    email: EmailStr
    name: str
    cpf: str
    phone: str
    status: str
    primary_role: str
    is_active: bool
    is_superuser: bool
    birth_date: date | None = None
    created_at: datetime
    updated_at: datetime
    municipalities: list[MunicipalityAccessDetail]


class UserCreate(CamelModel):
    login: str = Field(min_length=3, max_length=60, pattern=r"^[a-z0-9._-]+$")
    email: EmailStr
    name: str = Field(min_length=2, max_length=200)
    cpf: str = Field(min_length=11, max_length=14)
    phone: str = Field(default="", max_length=20)
    primary_role: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=8, max_length=200)
    status: UserStatusLiteral = "Ativo"
    municipalities: list[MunicipalityAccessInput] = Field(default_factory=list)

    @field_validator("cpf")
    @classmethod
    def _cpf(cls, v: str) -> str:
        return validate_cpf(v)

    @field_validator("login")
    @classmethod
    def _login(cls, v: str) -> str:
        return v.strip().lower()


class UserUpdate(CamelModel):
    email: EmailStr | None = None
    name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    primary_role: str | None = Field(default=None, min_length=2, max_length=100)
    status: UserStatusLiteral | None = None
    municipalities: list[MunicipalityAccessInput] | None = None


class UserUpdateMe(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None


class AdminResetPasswordRequest(CamelModel):
    # Admin informa nova senha (ex: o próprio admin gerou uma provisória no front).
    # Quando omitida, o backend gera automaticamente.
    new_password: str | None = Field(default=None, min_length=8, max_length=200)


class AdminResetPasswordResponse(CamelModel):
    message: str
    new_password: str  # texto plano (provisório) para o admin entregar ao usuário


class MessageResponse(CamelModel):
    message: str


class UserStats(CamelModel):
    total: int
    ativo: int
    inativo: int
    bloqueado: int


# ─── Listagem ─────────────────────────────────────────────────────────────────


class UserListParams(CamelModel):
    """Parâmetros de filtro da listagem."""

    search: str | None = None
    status: UserStatusLiteral | None = None
    module: str | None = None
    page: int = 1
    page_size: int = 20
