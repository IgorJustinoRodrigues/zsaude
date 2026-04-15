"""Schemas de tenants e work context."""

from __future__ import annotations

from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


class FacilityRead(CamelModel):
    id: UUID
    name: str
    short_name: str
    type: str
    cnes: str | None = None
    municipality_id: UUID


class FacilityWithAccess(CamelModel):
    facility: FacilityRead
    role: str
    modules: list[str]


class MunicipalityRead(CamelModel):
    id: UUID
    name: str
    state: str
    ibge: str


class MunicipalityWithFacilities(CamelModel):
    municipality: MunicipalityRead
    facilities: list[FacilityWithAccess]


class WorkContextOptions(CamelModel):
    """Árvore completa de opções de contexto do usuário logado."""

    municipalities: list[MunicipalityWithFacilities]


class WorkContextSelect(CamelModel):
    municipality_id: UUID
    facility_id: UUID
    # Módulo opcional: se vazio, mantém todos os módulos disponíveis na unidade.
    module: str | None = Field(default=None, max_length=10)


class WorkContextIssued(CamelModel):
    context_token: str
    municipality: MunicipalityRead
    facility: FacilityRead
    role: str
    modules: list[str]
    expires_in: int


class WorkContextCurrent(CamelModel):
    municipality: MunicipalityRead
    facility: FacilityRead
    role: str
    modules: list[str]


# ─── Admin CRUD ──────────────────────────────────────────────────────────────


class MunicipalityCreate(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    state: str = Field(min_length=2, max_length=2)
    ibge: str = Field(min_length=6, max_length=7, pattern=r"^\d{6,7}$")


class MunicipalityUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    state: str | None = Field(default=None, min_length=2, max_length=2)


class MunicipalityDetail(CamelModel):
    id: UUID
    name: str
    state: str
    ibge: str
    archived: bool
    schema_name: str
    facility_count: int
    user_count: int


class FacilityCreate(CamelModel):
    municipality_id: UUID
    name: str = Field(min_length=2, max_length=200)
    short_name: str = Field(min_length=2, max_length=80)
    type: str = Field(min_length=2, max_length=20)
    cnes: str | None = Field(default=None, max_length=7)


class FacilityUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    short_name: str | None = Field(default=None, min_length=2, max_length=80)
    type: str | None = Field(default=None, min_length=2, max_length=20)
    cnes: str | None = Field(default=None, max_length=7)


class MessageResponse(CamelModel):
    message: str
