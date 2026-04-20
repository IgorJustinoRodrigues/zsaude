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
    # ``None`` = herda do município; lista = personalização.
    enabled_modules: list[str] | None = None
    archived: bool = False


class CnesBindingRead(CamelModel):
    id: UUID
    cbo_id: str
    cbo_description: str | None = None
    cnes_professional_id: str
    cnes_snapshot_cpf: str | None = None
    cnes_snapshot_nome: str | None = None


class FacilityWithAccess(CamelModel):
    facility: FacilityRead
    role: str
    modules: list[str]
    # Vínculos CNES atribuídos a esse acesso (profissional × CBO). Vazio
    # quando MASTER ou quando o acesso ainda não foi vinculado a nenhum
    # profissional.
    cnes_bindings: list[CnesBindingRead] = []


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
    # Vínculo CNES ativo na sessão (opcional). Quando o ``FacilityAccess``
    # tem múltiplos CBOs vinculados, o frontend pede qual usar; os demais
    # casos (0 ou 1 binding) passam ``None`` e o service resolve sozinho.
    cbo_binding_id: UUID | None = None


class WorkContextIssued(CamelModel):
    context_token: str
    municipality: MunicipalityRead
    facility: FacilityRead
    role: str
    modules: list[str]
    permissions: list[str]
    expires_in: int
    # Vínculo CNES ativo na sessão (null quando não há binding ou MASTER).
    cbo_binding: CnesBindingRead | None = None


class WorkContextCurrent(CamelModel):
    municipality: MunicipalityRead
    facility: FacilityRead
    role: str
    modules: list[str]
    permissions: list[str]
    cbo_binding: CnesBindingRead | None = None


# ─── Admin CRUD ──────────────────────────────────────────────────────────────


class NeighborhoodInput(CamelModel):
    """Item do array de bairros. ``id`` é opcional: se vier, atualiza; senão, cria."""

    id: UUID | None = None
    name: str = Field(min_length=2, max_length=120)
    population: int | None = Field(default=None, ge=0)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    # Polígono: lista de [lat, lng].
    territory: list[list[float]] | None = None


class NeighborhoodOut(CamelModel):
    id: UUID
    name: str
    population: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    territory: list[list[float]] | None = None


class MunicipalityCreate(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    state: str = Field(min_length=2, max_length=2)
    ibge: str = Field(min_length=6, max_length=7, pattern=r"^\d{6,7}$")
    population: int | None = Field(default=None, ge=0)
    center_latitude: float | None = Field(default=None, ge=-90, le=90)
    center_longitude: float | None = Field(default=None, ge=-180, le=180)
    territory: list[list[float]] | None = None
    neighborhoods: list[NeighborhoodInput] = Field(default_factory=list)
    # Módulos operacionais habilitados. Se omitido, usa o conjunto completo.
    enabled_modules: list[str] | None = None
    timezone: str = Field(default="America/Sao_Paulo", min_length=3, max_length=64)
    # Credenciais CadSUS opcionais na criação (se omitidas, caem no fallback
    # da env var global).
    cadsus_user: str | None = Field(default=None, max_length=100)
    cadsus_password: str | None = Field(default=None, max_length=200)


class MunicipalityUpdate(CamelModel):
    """PATCH do município. ``ibge`` é imutável após criação — não aparece aqui."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    state: str | None = Field(default=None, min_length=2, max_length=2)
    population: int | None = Field(default=None, ge=0)
    center_latitude: float | None = Field(default=None, ge=-90, le=90)
    center_longitude: float | None = Field(default=None, ge=-180, le=180)
    territory: list[list[float]] | None = None
    # Se ``neighborhoods`` vier, substitui toda a lista atual.
    neighborhoods: list[NeighborhoodInput] | None = None
    enabled_modules: list[str] | None = None
    cadsus_user: str | None = Field(default=None, max_length=100)
    cadsus_password: str | None = Field(default=None, max_length=200)
    timezone: str | None = Field(default=None, min_length=3, max_length=64)


class MunicipalityDetail(CamelModel):
    id: UUID
    name: str
    state: str
    ibge: str
    archived: bool
    schema_name: str
    facility_count: int
    user_count: int
    population: int | None = None
    center_latitude: float | None = None
    center_longitude: float | None = None
    territory: list[list[float]] | None = None
    neighborhoods: list[NeighborhoodOut] = Field(default_factory=list)
    enabled_modules: list[str] = Field(default_factory=list)
    cadsus_user: str = ""
    cadsus_password_set: bool = False
    timezone: str = "America/Sao_Paulo"


class FacilityCreate(CamelModel):
    municipality_id: UUID
    name: str = Field(min_length=2, max_length=200)
    short_name: str = Field(min_length=2, max_length=80)
    type: str = Field(min_length=2, max_length=20)
    cnes: str | None = Field(default=None, max_length=7)
    # ``None`` = herda todos os módulos do município.
    enabled_modules: list[str] | None = None


class FacilityUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    short_name: str | None = Field(default=None, min_length=2, max_length=80)
    type: str | None = Field(default=None, min_length=2, max_length=20)
    cnes: str | None = Field(default=None, max_length=7)
    # ``None`` explicitamente = herda do município. Lista = subset custom.
    # Omitir o campo no PATCH não mexe no valor atual.
    enabled_modules: list[str] | None = None


class MessageResponse(CamelModel):
    message: str
