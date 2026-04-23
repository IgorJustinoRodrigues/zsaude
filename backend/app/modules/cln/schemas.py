"""DTOs do módulo Clínico.

``cln_config`` tem 4 campos (todos opcionais na entrada — ausência =
herda):

- ``enabled``: módulo ativo nesta unidade/município
- ``triagem_enabled``: se o fluxo passa por triagem antes do atendimento
- ``triagem_sector_name``: setor cujos tickets alimentam a fila de triagem
- ``atendimento_sector_name``: setor cujos tickets alimentam a fila de
  atendimento final

Quando ``triagem_enabled=false``, ``triagem_sector_name`` é ignorado e a
recepção encaminha direto pra ``atendimento_sector_name``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from app.core.schema_base import CamelModel


class _TolerantCamelModel(CamelModel):
    """Tolerante com campos extras — ajuda em migrações de config."""

    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        from_attributes=True,
    )


class ClnConfig(_TolerantCamelModel):
    """Config do módulo Clínico. Todos os campos opcionais — ausência = herda."""

    enabled: bool | None = None
    triagem_enabled: bool | None = None
    triagem_sector_name: str | None = None
    atendimento_sector_name: str | None = None


class ClnConfigRead(CamelModel):
    """GET do recurso bruto (o que foi salvo neste escopo, sem merge)."""

    scope_type: Literal["municipality", "facility"]
    scope_id: str
    config: ClnConfig | None = None


class ClnConfigUpdate(CamelModel):
    """Payload do PATCH.

    - ``{"config": null}`` limpa a config do escopo (volta a herdar tudo).
    - Parcial: só envia as chaves que quer mexer.
    """

    config: ClnConfig | None = None


class EffectiveClnConfig(CamelModel):
    """Config efetiva pós-merge (defaults → município → unidade)."""

    enabled: bool
    triagem_enabled: bool
    triagem_sector_name: str | None = None
    atendimento_sector_name: str | None = None
    sources: dict[str, Literal["default", "municipality", "facility"]] = Field(
        default_factory=dict,
        description="Origem de cada campo: 'default', 'municipality' ou 'facility'.",
    )


# ─── Fila / ações ────────────────────────────────────────────────────

ClnStatus = Literal[
    "triagem_waiting", "sector_waiting",
    "cln_called", "cln_attending",
    "finished", "cancelled", "evasion",
]


class ClnQueueItem(CamelModel):
    """Item da fila (triagem ou atendimento)."""

    id: UUID
    facility_id: UUID
    ticket_number: str
    priority: bool
    patient_id: UUID | None = None
    patient_name: str
    status: ClnStatus
    sector_name: str | None = None
    arrived_at: datetime
    called_at: datetime | None = None
    started_at: datetime | None = None


class CancelInput(CamelModel):
    reason: str = ""
