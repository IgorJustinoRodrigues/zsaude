"""Schemas de usuário."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Literal
from uuid import UUID

from pydantic import EmailStr, Field, field_validator, model_validator

from app.core.schema_base import CamelModel
from app.core.validators import validate_cpf, validate_password_strength

if TYPE_CHECKING:
    from app.modules.users.models import User

UserStatusLiteral = Literal["Ativo", "Inativo", "Bloqueado"]
UserLevelLiteral = Literal["master", "admin", "user"]


class UserRead(CamelModel):
    """Perfil completo (para /auth/me e /users/me)."""

    id: UUID
    login: str
    email: EmailStr | None = None
    name: str
    social_name: str = ""
    cpf: str | None = None
    phone: str
    status: str
    level: UserLevelLiteral
    primary_role: str
    birth_date: date | None = None
    current_photo_id: UUID | None = None
    face_opt_in: bool = True
    # Política de senha — ``null`` quando política desligada.
    password_expires_at: datetime | None = None
    password_expires_in_days: int | None = None
    password_expired: bool = False
    # Quando True, usuário precisa trocar a senha antes de usar o sistema
    # (senha provisória gerada por admin).
    must_change_password: bool = False
    created_at: datetime


class UserListItem(CamelModel):
    """Item da listagem. Inclui resumo: total de municípios e módulos."""

    id: UUID
    login: str
    email: EmailStr | None = None
    name: str
    cpf: str | None = None
    phone: str
    status: str
    level: UserLevelLiteral
    primary_role: str
    created_at: datetime
    municipality_count: int
    facility_count: int
    modules: list[str]


class FacilityAccessInput(CamelModel):
    facility_id: UUID
    role_id: UUID


class MunicipalityAccessInput(CamelModel):
    municipality_id: UUID
    facilities: list[FacilityAccessInput] = Field(default_factory=list)


class FacilityAccessDetail(CamelModel):
    facility_access_id: UUID
    facility_id: UUID
    facility_name: str
    facility_short_name: str
    facility_type: str
    role_id: UUID
    role: str           # nome do role (exibição)
    modules: list[str]  # derivado das permissões


class MunicipalityAccessDetail(CamelModel):
    municipality_id: UUID
    municipality_name: str
    municipality_state: str
    facilities: list[FacilityAccessDetail]


class UserDetail(CamelModel):
    """Perfil detalhado para a tela de visualização administrativa."""

    id: UUID
    login: str
    email: EmailStr | None = None
    name: str
    social_name: str = ""
    cpf: str | None = None
    phone: str
    status: str
    level: UserLevelLiteral
    primary_role: str
    is_active: bool
    is_superuser: bool
    birth_date: date | None = None
    current_photo_id: UUID | None = None
    face_opt_in: bool = True
    created_at: datetime
    updated_at: datetime
    municipalities: list[MunicipalityAccessDetail]


class UserCreate(CamelModel):
    # Pelo menos um entre ``cpf`` e ``email`` é obrigatório. O backend
    # gera o ``login`` interno a partir do que foi informado — o usuário
    # nunca precisa "escolher" um nome de acesso.
    email: EmailStr | None = None
    name: str = Field(min_length=2, max_length=200)
    cpf: str | None = Field(default=None, max_length=14)
    phone: str = Field(default="", max_length=20)
    primary_role: str = Field(min_length=2, max_length=100)
    password: str = Field(max_length=200)
    status: UserStatusLiteral = "Ativo"
    level: UserLevelLiteral = "user"
    municipalities: list[MunicipalityAccessInput] = Field(default_factory=list)

    @field_validator("cpf")
    @classmethod
    def _cpf(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        return validate_cpf(v)

    @field_validator("password")
    @classmethod
    def _pwd(cls, v: str) -> str:
        return validate_password_strength(v)

    @model_validator(mode="after")
    def _require_cpf_or_email(self) -> "UserCreate":
        if not self.cpf and not self.email:
            raise ValueError("Informe CPF ou e-mail — pelo menos um é obrigatório.")
        return self


class UserUpdate(CamelModel):
    email: EmailStr | None = None
    name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    primary_role: str | None = Field(default=None, min_length=2, max_length=100)
    status: UserStatusLiteral | None = None
    level: UserLevelLiteral | None = None
    municipalities: list[MunicipalityAccessInput] | None = None


class UserUpdateMe(CamelModel):
    """Campos que o próprio usuário pode editar em "Minha Conta"."""

    name: str | None = Field(default=None, min_length=2, max_length=200)
    social_name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    birth_date: date | None = None
    face_opt_in: bool | None = None


def user_read_from_orm(user: "User") -> UserRead:
    """Converte ``User`` ORM em ``UserRead`` incluindo expiração de senha."""
    from app.modules.auth.password_policy import (
        is_password_expired,
        password_expires_at,
        password_expires_in_days,
    )
    base = UserRead.model_validate(user)
    # Override dos campos que dependem de system_settings.
    return base.model_copy(update={
        "password_expires_at": password_expires_at(user),
        "password_expires_in_days": password_expires_in_days(user),
        "password_expired": is_password_expired(user),
        "must_change_password": bool(user.must_change_password),
    })


class AdminResetPasswordRequest(CamelModel):
    # Admin informa nova senha (ex: o próprio admin gerou uma provisória no front).
    # Quando omitida, o backend gera automaticamente.
    new_password: str | None = Field(default=None, max_length=200)

    @field_validator("new_password")
    @classmethod
    def _pwd(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return validate_password_strength(v)


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


# ─── Foto ─────────────────────────────────────────────────────────────────────


class UserPhotoDuplicateMatch(CamelModel):
    """Identifica o usuário cuja foto bateu como duplicata."""

    user_id: UUID
    user_name: str
    similarity: float  # 0..1


class UserPhotoUploadResponse(CamelModel):
    """Resposta do upload — inclui status do enroll facial."""

    photo_id: UUID
    mime_type: str
    file_size: int
    uploaded_at: datetime
    # ok | no_face | low_quality | error | disabled | opted_out | duplicate
    face_enrollment: str
    # Preenchido quando ``face_enrollment='duplicate'`` — identifica o
    # usuário cuja face bateu acima do threshold (>0.85).
    duplicate_of: UserPhotoDuplicateMatch | None = None


class UserPhotoListItem(CamelModel):
    """Item do histórico de fotos."""

    id: UUID
    mime_type: str
    file_size: int
    width: int | None = None
    height: int | None = None
    uploaded_at: datetime
    uploaded_by_name: str


class UserAnniversaryStats(CamelModel):
    """Estatísticas de uso do usuário no último ano — pro modal de aniversário."""

    total_actions: int
    days_active: int
    logins: int
    patients_touched: int
    most_used_module: str | None = None
    most_used_module_count: int = 0


class UserAnniversaryResponse(CamelModel):
    """Retorno do endpoint /users/me/anniversary."""

    is_birthday: bool
    first_name: str
    age: int | None = None
    stats: UserAnniversaryStats


class UserBirthdayItem(CamelModel):
    """Item da listagem de aniversariantes."""

    id: UUID
    name: str
    social_name: str = ""
    level: UserLevelLiteral
    primary_role: str
    birth_date: date
    day: int           # dia do mês do aniversário
    month: int         # mês do aniversário
    is_today: bool     # hoje é o aniversário
    age: int           # idade que fará no aniversário deste ano
