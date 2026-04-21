"""DTOs dos painéis lógicos."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


Scope = Literal["municipality", "facility"]
PainelMode = Literal["senha", "nome", "ambos"]


class PainelRead(CamelModel):
    id: UUID
    scope_type: Scope
    scope_id: UUID
    name: str
    mode: PainelMode = "senha"
    announce_audio: bool = True
    sector_names: list[str] = []
    archived: bool = False


class PainelCreate(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    mode: PainelMode = "senha"
    announce_audio: bool = True
    sector_names: list[str] = Field(default_factory=list)


class PainelUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    mode: PainelMode | None = None
    announce_audio: bool | None = None
    sector_names: list[str] | None = None
    archived: bool | None = None


class AvailablePainel(PainelRead):
    """Painel disponível pra uma facility. Inclui o flag ``inherited``
    pra a UI deixar claro se é próprio ou herdado do município."""

    inherited: bool = False
