"""DTOs dos totens lógicos."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


Scope = Literal["municipality", "facility"]


class TotemCapture(CamelModel):
    cpf: bool = True
    cns: bool = True
    face: bool = False
    manual_name: bool = True


def default_capture() -> TotemCapture:
    return TotemCapture()


class TotemNumbering(CamelModel):
    ticket_prefix_normal: str = Field(default="R", min_length=1, max_length=5)
    ticket_prefix_priority: str = Field(default="P", min_length=1, max_length=5)
    reset_strategy: Literal["daily", "weekly", "monthly", "never"] = "daily"
    number_padding: int = Field(default=3, ge=1, le=6)


def default_numbering() -> TotemNumbering:
    return TotemNumbering()


class TotemRead(CamelModel):
    id: UUID
    scope_type: Scope
    scope_id: UUID
    name: str
    capture: TotemCapture = Field(default_factory=default_capture)
    priority_prompt: bool = True
    archived: bool = False
    numbering: TotemNumbering = Field(default_factory=default_numbering)
    # NULL = totem padrão (recepção). Preenchido = senha vai direto pra
    # fila daquele setor (status=sector_waiting).
    default_sector_name: str | None = None


class TotemCreate(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    capture: TotemCapture = Field(default_factory=default_capture)
    priority_prompt: bool = True
    numbering: TotemNumbering = Field(default_factory=default_numbering)
    default_sector_name: str | None = None


class TotemUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    capture: TotemCapture | None = None
    priority_prompt: bool | None = None
    archived: bool | None = None
    numbering: TotemNumbering | None = None
    default_sector_name: str | None = None


class AvailableTotem(TotemRead):
    inherited: bool = False
