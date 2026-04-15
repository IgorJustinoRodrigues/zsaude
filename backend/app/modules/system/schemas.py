"""Schemas de system_settings."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.core.schema_base import CamelModel


class SettingRead(CamelModel):
    id: UUID
    key: str
    value: Any
    description: str


class SettingUpdate(CamelModel):
    value: Any
