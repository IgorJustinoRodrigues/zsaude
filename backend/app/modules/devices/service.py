"""Serviço de pareamento e gestão de dispositivos."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import redis.asyncio as redis
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_opaque_token
from app.modules.devices.models import Device
from app.modules.devices.schemas import (
    DeviceListItem,
    DevicePairInput,
    DeviceRead,
    DeviceRegisterInput,
    DeviceRegisterOutput,
    DeviceStatusOutput,
)
from app.modules.users.models import User

# Janela em que o ``pairing_code`` é válido. Depois disso o device precisa
# registrar de novo. Curto de propósito — se o usuário vai até o admin,
# digita o code e confirma, 10min é mais que suficiente.
PAIRING_TTL_MINUTES = 10

# Alfabeto do code — sem chars ambíguos (0/O, 1/I/L).
_PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_PAIRING_LENGTH = 6

# Quanto tempo o plaintext do token fica disponível pro device coletar
# no Redis depois que o admin pareia. Curto — 2min sobram pro polling
# de 2s detectar e guardar.
_TOKEN_HANDOFF_TTL_SECONDS = 120


def _token_handoff_key(device_id: UUID) -> str:
    return f"device:handoff:{device_id}"


def _gen_pairing_code() -> str:
    return "".join(secrets.choice(_PAIRING_ALPHABET) for _ in range(_PAIRING_LENGTH))


def _gen_device_token() -> str:
    """Token opaco do device — apresentado em todos os requests autenticados
    do device (header ``X-Device-Token``). Nunca volta pro servidor em
    plaintext na storage; só o hash SHA-256 é guardado."""
    return secrets.token_urlsafe(48)


class DeviceService:
    def __init__(self, db: AsyncSession, valkey: redis.Redis | None = None):
        self.db = db
        # ``valkey`` é opcional — vários métodos não precisam (ex.: list,
        # revoke). Só ``pair`` (escreve handoff) e ``status`` (consome
        # handoff) exigem.
        self.valkey = valkey

    # ── Público (sem auth) ─────────────────────────────────────────────

    async def register(self, payload: DeviceRegisterInput) -> DeviceRegisterOutput:
        """Cria um device pendente com um ``pairing_code`` fresco.

        Retry até 5x em caso de colisão de código (extremamente raro
        com 6 chars em alfabeto de 31 símbolos, mas zero custo).
        """
        expires = datetime.now(timezone.utc) + timedelta(minutes=PAIRING_TTL_MINUTES)
        for _ in range(5):
            code = _gen_pairing_code()
            # Checa colisão só contra códigos ainda não consumidos.
            existing = await self.db.scalar(
                select(Device).where(Device.pairing_code == code)
            )
            if existing is not None:
                continue
            device = Device(
                type=payload.type,
                pairing_code=code,
                pairing_expires_at=expires,
            )
            self.db.add(device)
            await self.db.flush()
            return DeviceRegisterOutput(
                device_id=device.id,
                pairing_code=code,
                pairing_expires_at=expires,
            )
        raise HTTPException(
            status_code=503, detail="Não foi possível gerar código — tente novamente.",
        )

    async def status(self, device_id: UUID) -> DeviceStatusOutput:
        """Status pro polling do device. Quando paired, devolve o
        ``device_token`` em plaintext — **uma única vez**: o device
        guarda e passa a usar o token em requests seguintes.

        O plaintext vem do Redis (``handoff``) gravado no momento do
        pair. TTL curto: se o device não buscar em 2min, perde acesso e
        precisa registrar de novo.
        """
        device = await self._get_or_404(device_id)

        if device.revoked_at is not None:
            return DeviceStatusOutput(status="revoked")

        if device.token_hash is not None:
            plain: str | None = None
            if self.valkey is not None:
                key = _token_handoff_key(device_id)
                plain = await self.valkey.get(key)
                if plain is not None:
                    await self.valkey.delete(key)
            return DeviceStatusOutput(
                status="paired",
                device_token=plain,
                name=device.name,
                facility_id=device.facility_id,
            )

        # Ainda pending — se expirou, vira stale; device deve registrar de novo.
        if device.pairing_expires_at and device.pairing_expires_at < datetime.now(timezone.utc):
            return DeviceStatusOutput(status="stale")

        return DeviceStatusOutput(status="pending")

    # ── Admin (usuário autenticado) ────────────────────────────────────

    async def pair(
        self, payload: DevicePairInput, actor_user_id: UUID,
    ) -> DeviceRead:
        """Consome um ``pairing_code`` e gera o ``device_token``.

        Também guarda o plaintext do token no device (atributo
        transiente ``_new_plain_token``) pra o próximo polling
        retornar. Isso evita que o token trafegue via o canal admin
        (que é o navegador do operador), só pelo canal do device.
        """
        code = payload.code.strip().upper()
        device = await self.db.scalar(
            select(Device).where(Device.pairing_code == code)
        )
        if device is None:
            raise HTTPException(status_code=404, detail="Código não encontrado.")
        if device.pairing_expires_at and device.pairing_expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Código expirado.")
        if device.type != payload.type:
            raise HTTPException(
                status_code=409,
                detail=f"O código pertence a um {device.type}, não a um {payload.type}.",
            )
        if device.token_hash is not None:
            raise HTTPException(status_code=409, detail="Dispositivo já pareado.")

        # Gera o token e guarda só o hash.
        plain = _gen_device_token()
        device.token_hash = hash_opaque_token(plain)
        device.pairing_code = None
        device.pairing_expires_at = None
        device.paired_at = datetime.now(timezone.utc)
        device.paired_by_user_id = actor_user_id
        device.facility_id = payload.facility_id
        device.name = payload.name

        # Handoff do plaintext via Redis (TTL 2min). O device buscará no
        # próximo polling. Se o Valkey cair, o device fica sem token e
        # precisará registrar de novo — comportamento aceitável.
        if self.valkey is not None:
            await self.valkey.set(
                _token_handoff_key(device.id),
                plain,
                ex=_TOKEN_HANDOFF_TTL_SECONDS,
            )

        await self.db.flush()
        return _to_read(device)

    async def list_for_facility(self, facility_id: UUID) -> list[DeviceListItem]:
        """Devices pareados ou pendentes desta unidade. Inclui revogados
        dos últimos 30 dias pra auditoria."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        result = await self.db.execute(
            select(Device, User.name)
            .join(User, User.id == Device.paired_by_user_id, isouter=True)
            .where(Device.facility_id == facility_id)
            .where(
                (Device.revoked_at.is_(None)) | (Device.revoked_at >= cutoff),
            )
            .order_by(Device.created_at.desc())
        )
        items: list[DeviceListItem] = []
        for device, user_name in result.all():
            base = _to_read(device)
            items.append(DeviceListItem(
                **base.model_dump(), paired_by_user_name=user_name,
            ))
        return items

    async def revoke(self, device_id: UUID, actor_user_id: UUID) -> DeviceRead:
        device = await self._get_or_404(device_id)
        if device.revoked_at is not None:
            raise HTTPException(status_code=409, detail="Dispositivo já revogado.")
        device.revoked_at = datetime.now(timezone.utc)
        device.revoked_by_user_id = actor_user_id
        device.token_hash = None  # bloqueia acesso imediatamente
        await self.db.flush()
        return _to_read(device)

    # ── Auth do device (usado por dependency) ──────────────────────────

    async def authenticate_by_token(self, plain_token: str) -> Device:
        """Resolve o device a partir do plaintext do token."""
        token_hash = hash_opaque_token(plain_token)
        device = await self.db.scalar(
            select(Device).where(Device.token_hash == token_hash)
        )
        if device is None or device.revoked_at is not None:
            raise HTTPException(status_code=401, detail="Token de dispositivo inválido.")
        return device

    # ── Internos ───────────────────────────────────────────────────────

    async def _get_or_404(self, device_id: UUID) -> Device:
        device = await self.db.get(Device, device_id)
        if device is None:
            raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
        return device


def _to_read(device: Device) -> DeviceRead:
    # ``status`` é uma property que retorna 'pending' | 'paired' | ...
    # Pydantic valida contra o Literal ao construir o schema.
    return DeviceRead.model_validate({
        "id": device.id,
        "type": device.type,
        "facilityId": device.facility_id,
        "name": device.name,
        "status": device.status,
        "pairedAt": device.paired_at,
        "pairedByUserId": device.paired_by_user_id,
        "lastSeenAt": device.last_seen_at,
        "revokedAt": device.revoked_at,
        "createdAt": device.created_at,
    })
