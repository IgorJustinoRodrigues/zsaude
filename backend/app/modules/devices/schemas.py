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
    # Vínculo opcional — pode-se parear sem escolher e decidir depois.
    # Painel_id se type='painel'; totem_id se type='totem'. Ambos None
    # = device fica "aguardando configuração".
    painel_id: UUID | None = None
    totem_id: UUID | None = None


class DeviceUpdate(CamelModel):
    """Trocar nome ou vínculo sem re-parear. Enviar ``painel_id: null``
    (ou ``totem_id: null``) desvincula."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    painel_id: UUID | None = None
    totem_id: UUID | None = None


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

    # Vínculo
    painel_id: UUID | None = None
    painel_name: str | None = None
    totem_id: UUID | None = None
    totem_name: str | None = None


class DeviceListItem(DeviceRead):
    """Mesmo que ``DeviceRead`` mas com espaço pra nome do usuário que
    pareou (resolvido no service)."""

    paired_by_user_name: str | None = None


# ─── Runtime do device: config efetiva ──────────────────────────────────────

class DeviceConfigPainel(CamelModel):
    id: UUID
    name: str
    mode: str
    announce_audio: bool
    sector_names: list[str]
    voice_id: UUID | None = None
    repeat_count: int = 1
    silence_enabled: bool = True
    silence_message: str = "Por favor, silêncio na recepção."


class DeviceConfigTotem(CamelModel):
    id: UUID
    name: str
    capture: dict
    priority_prompt: bool
    voice_id: UUID | None = None


class DeviceConfigOutput(CamelModel):
    """Config que o device consome em runtime. Se ``painel`` e ``totem``
    são ambos ``None``, o device está pareado mas **aguardando
    configuração** — o UI mostra uma tela "Aguardando config" até o
    admin vincular um painel/totem."""

    device_id: UUID
    type: DeviceType
    name: str | None = None
    facility_id: UUID | None = None
    painel: DeviceConfigPainel | None = None
    totem: DeviceConfigTotem | None = None
