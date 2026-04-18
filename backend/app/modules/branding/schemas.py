"""DTOs do módulo branding."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


class BrandingUpdate(CamelModel):
    """Payload de atualização.

    Strings vazias são **preservadas** como "limpar campo" — usar ``None``
    (omitir no JSON) para manter o valor atual. ``pdf_configs`` faz merge
    superficial: chaves enviadas sobrescrevem; omitidas continuam.
    """

    display_name: str | None = Field(default=None, max_length=200)
    header_line_1: str | None = Field(default=None, max_length=200)
    header_line_2: str | None = Field(default=None, max_length=200)
    footer_text: str | None = Field(default=None, max_length=500)
    primary_color: str | None = Field(default=None, max_length=16)
    pdf_configs: dict[str, Any] | None = None


class BrandingRead(CamelModel):
    """Retorno do GET do recurso bruto (sem merge)."""

    id: UUID
    scope_type: str
    scope_id: UUID
    logo_file_id: UUID | None = None
    display_name: str = ""
    header_line_1: str = ""
    header_line_2: str = ""
    footer_text: str = ""
    primary_color: str = ""
    pdf_configs: dict[str, Any] = {}


class EffectiveBranding(CamelModel):
    """Config efetiva pós-merge (facility > municipality > sistema).

    O frontend consome isso pra renderizar PDFs, painéis, etc.
    ``logo_url`` já vem como URL autenticada (proxy via /api/v1/files/...);
    demais campos estão prontos pra uso.
    """

    display_name: str = ""
    header_line_1: str = ""
    header_line_2: str = ""
    footer_text: str = ""
    primary_color: str = ""
    logo_url: str | None = None
    pdf_configs: dict[str, Any] = {}
    # Metadados do que foi usado (ajuda debug e exibição "herdando de...").
    source_municipality_id: UUID | None = None
    source_facility_id: UUID | None = None


class LogoUploadResponse(CamelModel):
    logo_file_id: UUID
    logo_url: str
