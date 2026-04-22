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
    DeviceConfigOutput,
    DeviceConfigPainel,
    DeviceConfigTotem,
    DeviceListItem,
    DevicePairInput,
    DeviceRead,
    DeviceRegisterInput,
    DeviceRegisterOutput,
    DeviceStatusOutput,
    DeviceUpdate,
)
from app.modules.painels.models import Painel
from app.modules.painels.service import PainelService
from app.modules.tenants.models import Facility
from app.modules.totens.models import Totem
from app.modules.totens.service import TotemService
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

        # Valida vínculo (painel/totem) se informado.
        await self._resolve_link_or_400(
            payload.type, payload.facility_id,
            painel_id=payload.painel_id, totem_id=payload.totem_id,
        )

        # Gera o token e guarda só o hash.
        plain = _gen_device_token()
        device.token_hash = hash_opaque_token(plain)
        device.pairing_code = None
        device.pairing_expires_at = None
        device.paired_at = datetime.now(timezone.utc)
        device.paired_by_user_id = actor_user_id
        device.facility_id = payload.facility_id
        device.name = payload.name
        device.painel_id = payload.painel_id if payload.type == "painel" else None
        device.totem_id = payload.totem_id if payload.type == "totem" else None

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

    async def update(
        self, device_id: UUID, payload: DeviceUpdate, sent_fields: set[str],
    ) -> DeviceRead:
        """Atualiza nome e/ou vínculo. ``sent_fields`` = model_fields_set
        (distingue "não enviado" de "enviado como null pra desvincular")."""
        device = await self._get_or_404(device_id)

        if "name" in sent_fields and payload.name is not None:
            device.name = payload.name

        if device.type == "painel":
            if "painel_id" in sent_fields:
                if payload.painel_id is None:
                    device.painel_id = None
                else:
                    await self._resolve_link_or_400(
                        "painel", device.facility_id,
                        painel_id=payload.painel_id, totem_id=None,
                    )
                    device.painel_id = payload.painel_id
        elif device.type == "totem":
            if "totem_id" in sent_fields:
                if payload.totem_id is None:
                    device.totem_id = None
                else:
                    await self._resolve_link_or_400(
                        "totem", device.facility_id,
                        painel_id=None, totem_id=payload.totem_id,
                    )
                    device.totem_id = payload.totem_id

        await self.db.flush()
        return _to_read(device)

    # ── Config de runtime (usado pelo próprio device) ────────────────

    async def get_config(self, device: Device) -> DeviceConfigOutput:
        """Config que o device consome. ``painel``/``totem`` = None quando
        não vinculado (UI mostra "aguardando configuração")."""
        painel = None
        totem = None
        # Config efetiva — mode + voice_id vêm do rec_config (município
        # ou unidade). Admin muda num só lugar pra afetar todos os
        # painéis/totens do escopo.
        mode = "senha"
        painel_voice_id = None
        totem_voice_id = None
        if device.facility_id:
            try:
                from app.modules.rec.service import RecConfigService
                fac = await self.db.get(Facility, device.facility_id)
                if fac:
                    eff = await RecConfigService(self.db).effective_for_facility(
                        device.facility_id, fac.municipality_id,
                    )
                    mode = eff.painel.mode
                    painel_voice_id = _parse_uuid(eff.painel.voice_id)
                    totem_voice_id = _parse_uuid(eff.totem.voice_id)
            except Exception:
                pass

        if device.painel_id and device.painel:
            painel = DeviceConfigPainel(
                id=device.painel.id,
                name=device.painel.name,
                mode=mode or device.painel.mode,
                announce_audio=device.painel.announce_audio,
                sector_names=list(device.painel.sector_names),
                voice_id=painel_voice_id,
            )
        if device.totem_id and device.totem:
            totem = DeviceConfigTotem(
                id=device.totem.id,
                name=device.totem.name,
                capture=dict(device.totem.capture),
                priority_prompt=device.totem.priority_prompt,
                voice_id=totem_voice_id,
            )
        return DeviceConfigOutput.model_validate({
            "deviceId": device.id,
            "type": device.type,
            "name": device.name,
            "facilityId": device.facility_id,
            "painel": painel.model_dump(by_alias=True) if painel else None,
            "totem": totem.model_dump(by_alias=True) if totem else None,
        })

    async def list_for_facility(self, facility_id: UUID) -> list[DeviceListItem]:
        """Devices pareados ou pendentes desta unidade. Inclui revogados
        dos últimos 30 dias pra auditoria."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        # ``Device.painel`` e ``Device.totem`` são relationships lazy="joined"
        # — carregam automaticamente. Basta fazer join pra o nome do user.
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

    async def _resolve_link_or_400(
        self, device_type: str, facility_id: UUID | None,
        painel_id: UUID | None, totem_id: UUID | None,
    ) -> None:
        """Valida que o painel/totem informado existe E está disponível
        pra essa facility (próprio dela ou herdado do município).
        Lança 400/404 se inválido."""
        if painel_id is not None and device_type != "painel":
            raise HTTPException(status_code=400, detail="painel_id só é válido pra devices do tipo 'painel'.")
        if totem_id is not None and device_type != "totem":
            raise HTTPException(status_code=400, detail="totem_id só é válido pra devices do tipo 'totem'.")
        if painel_id is None and totem_id is None:
            return  # Ok — device pareado sem vínculo (aguardando config).
        if facility_id is None:
            raise HTTPException(status_code=400, detail="Device ainda não tem unidade — impossível validar vínculo.")

        if painel_id is not None:
            available = await PainelService(self.db).available_for_facility(facility_id)
            if not any(p.id == painel_id for p in available):
                raise HTTPException(
                    status_code=404,
                    detail="Painel não disponível nesta unidade (ou arquivado).",
                )
        if totem_id is not None:
            available = await TotemService(self.db).available_for_facility(facility_id)
            if not any(t.id == totem_id for t in available):
                raise HTTPException(
                    status_code=404,
                    detail="Totem não disponível nesta unidade (ou arquivado).",
                )

    async def _get_or_404(self, device_id: UUID) -> Device:
        device = await self.db.get(Device, device_id)
        if device is None:
            raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
        return device


def _parse_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(str(value))
    except (ValueError, TypeError):
        return None


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
        "painelId": device.painel_id,
        "painelName": device.painel.name if device.painel else None,
        "totemId": device.totem_id,
        "totemName": device.totem.name if device.totem else None,
    })
