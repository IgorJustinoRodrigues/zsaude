"""DTOs do módulo de dispositivos."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


DeviceType = Literal["totem", "painel"]
DeviceStatus = Literal["pending", "paired", "revoked", "stale"]


# ─── Pareamento (público) ────────────────────────────────────────────────────

class DeviceRegisterInput(CamelModel):
    type: DeviceType


class DeviceRegisterOutput(CamelModel):
    """Retorno do register. O ``deviceId`` fica privado no device; só o
    ``pairingCode`` é exibido na tela."""

    device_id: UUID
    pairing_code: str
    pairing_expires_at: datetime


class DeviceStatusOutput(CamelModel):
    status: DeviceStatus
    # Retornado apenas uma vez, quando o status vira ``paired`` — o device
    # guarda e usa em todas as requisições seguintes.
    device_token: str | None = None
    name: str | None = None
    facility_id: UUID | None = None


# ─── Admin (autenticado) ─────────────────────────────────────────────────────

class DevicePairInput(CamelModel):
    code: str = Field(min_length=4, max_length=10)
    facility_id: UUID
    name: str = Field(min_length=1, max_length=120)
    # Tipo é validado contra o device (o que registrou). O admin informa
    # pra confirmar — erro 409 se diferente.
    type: DeviceType


class DeviceRead(CamelModel):
    id: UUID
    type: DeviceType
    facility_id: UUID | None = None
    name: str | None = None
    status: DeviceStatus
    paired_at: datetime | None = None
    paired_by_user_id: UUID | None = None
    last_seen_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class DeviceListItem(DeviceRead):
    """Mesmo que ``DeviceRead`` mas com espaço pra nome do usuário que
    pareou (resolvido no service)."""

    paired_by_user_name: str | None = None
