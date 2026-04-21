"""Schemas I/O das tabelas de referência."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


class RefOut(CamelModel):
    id: UUID
    codigo: str
    descricao: str
    is_system: bool
    active: bool
    created_at: datetime
    updated_at: datetime


class RefCreate(CamelModel):
    codigo: str = Field(..., min_length=1, max_length=4)
    descricao: str = Field(..., min_length=1, max_length=100)
    active: bool = True


class RefUpdate(CamelModel):
    descricao: str | None = Field(default=None, min_length=1, max_length=100)
    active: bool | None = None
