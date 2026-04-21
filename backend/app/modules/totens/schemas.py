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


class TotemRead(CamelModel):
    id: UUID
    scope_type: Scope
    scope_id: UUID
    name: str
    capture: TotemCapture = Field(default_factory=default_capture)
    priority_prompt: bool = True
    archived: bool = False


class TotemCreate(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    capture: TotemCapture = Field(default_factory=default_capture)
    priority_prompt: bool = True


class TotemUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    capture: TotemCapture | None = None
    priority_prompt: bool | None = None
    archived: bool | None = None


class AvailableTotem(TotemRead):
    inherited: bool = False
