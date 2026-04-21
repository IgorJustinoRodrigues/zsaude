"""DTOs do módulo de setores."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


Scope = Literal["municipality", "facility"]


# ─── Defaults do sistema ─────────────────────────────────────────────────────

# Lista aplicada ao criar um município (via seed ou provisionamento).
# Ordem = ordem inicial de exibição.
SYSTEM_DEFAULT_SECTORS: list[dict[str, str]] = [
    {"name": "Cardiologia",            "abbreviation": "CARDIO"},
    {"name": "Clínica Médica",         "abbreviation": "CLIN"},
    {"name": "Eletrocardiograma",      "abbreviation": "ECG"},
    {"name": "Finalizar Atendimento",  "abbreviation": "FIM"},
    {"name": "Laboratório",            "abbreviation": "LAB"},
    {"name": "Ortopedia",              "abbreviation": "ORTO"},
    {"name": "Sala de Medicação",      "abbreviation": "MED"},
    {"name": "Sala de Observação",     "abbreviation": "OBS"},
    {"name": "Sala de RX",             "abbreviation": "RX"},
    {"name": "Sala de Triagem",        "abbreviation": "TRI"},
]


# ─── IO ──────────────────────────────────────────────────────────────────────

class SectorRead(CamelModel):
    id: UUID
    scope_type: Scope
    scope_id: UUID
    name: str
    abbreviation: str = ""
    display_order: int = 0
    archived: bool = False


class SectorCreate(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    abbreviation: str = Field(default="", max_length=20)
    display_order: int = 0


class SectorUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    abbreviation: str | None = Field(default=None, max_length=20)
    display_order: int | None = None
    archived: bool | None = None


class SectorReorder(CamelModel):
    """Reordena a lista — ``ids`` é a nova ordem completa dos não-arquivados.

    Os itens recebem ``display_order`` = posição no array (0, 1, 2...).
    Arquivados não entram e mantêm a ordem anterior (irrelevante na UI).
    """

    ids: list[UUID]


# ─── Efetivo (usado pela unidade em runtime) ─────────────────────────────────

class EffectiveSectorsOutput(CamelModel):
    """Setores efetivos de uma unidade + metadado de herança."""

    sectors: list[SectorRead]
    source: Literal["municipality", "facility"]
    facility_uses_custom: bool
