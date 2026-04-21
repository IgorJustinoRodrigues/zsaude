"""Endpoints de dispositivos pareados.

Endpoints públicos (sem auth — usados pelo próprio device):

- ``POST  /public/devices/register`` — gera ``(deviceId, pairingCode)``.
- ``GET   /public/devices/status/{device_id}`` — polling; devolve o
  ``deviceToken`` uma única vez quando pareado.

Endpoints autenticados (qualquer usuário com work-context):

- ``POST   /devices/pair``            — consome um ``pairingCode`` e
  vincula o device à unidade do work-context atual.
- ``GET    /devices``                 — lista devices da unidade atual.
- ``DELETE /devices/{id}``            — revoga o device.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from app.core.deps import DB, CurrentContextDep, CurrentUserDep, Valkey
from app.db.session import get_session
from app.modules.devices.hub import get_hub
from app.modules.devices.schemas import (
    DeviceConfigOutput,
    DeviceListItem,
    DevicePairInput,
    DeviceRead,
    DeviceRegisterInput,
    DeviceRegisterOutput,
    DeviceStatusOutput,
    DeviceUpdate,
)
from app.modules.devices.service import DeviceService
from app.modules.audit.writer import write_audit

public_router = APIRouter(prefix="/public/devices", tags=["devices-public"])
router = APIRouter(prefix="/devices", tags=["devices"])


# ─── Público ────────────────────────────────────────────────────────────────

@public_router.post("/register", response_model=DeviceRegisterOutput, status_code=201)
async def register_device(payload: DeviceRegisterInput, db: DB) -> DeviceRegisterOutput:
    return await DeviceService(db).register(payload)


@public_router.get("/status/{device_id}", response_model=DeviceStatusOutput)
async def device_status(device_id: UUID, db: DB, valkey: Valkey) -> DeviceStatusOutput:
    return await DeviceService(db, valkey).status(device_id)


@public_router.get("/config", response_model=DeviceConfigOutput)
async def device_config(
    db: DB,
    x_device_token: Annotated[str, Header(alias="X-Device-Token")],
) -> DeviceConfigOutput:
    """Config consumida pelo próprio device em runtime. Autentica via
    header ``X-Device-Token``. Retorna ``painel``/``totem`` = None
    quando o device está pareado mas sem vínculo (aguardando config)."""
    svc = DeviceService(db)
    device = await svc.authenticate_by_token(x_device_token)
    return await svc.get_config(device)


# ─── Autenticado: pareamento ────────────────────────────────────────────────

@router.post("/pair", response_model=DeviceRead, status_code=201)
async def pair_device(
    payload: DevicePairInput, db: DB, valkey: Valkey,
    ctx: CurrentContextDep, user: CurrentUserDep,
) -> DeviceRead:
    """Consome um código e vincula o device. ``facilityId`` do payload
    precisa bater com o work-context atual — evita que um usuário pareie
    device pra uma unidade que não é a dele."""
    if str(payload.facility_id) != str(ctx.facility_id):
        raise HTTPException(
            status_code=403,
            detail="Só é possível parear dispositivos da unidade atual.",
        )

    result = await DeviceService(db, valkey).pair(payload, actor_user_id=user.id)
    await write_audit(
        db,
        module="devices",
        action="paired",
        severity="info",
        resource="Device",
        resource_id=str(result.id),
        description=f"Dispositivo pareado: {payload.name} ({payload.type})",
        details={"type": payload.type, "name": payload.name},
    )
    return result


@router.get("", response_model=list[DeviceListItem])
async def list_devices(db: DB, ctx: CurrentContextDep) -> list[DeviceListItem]:
    return await DeviceService(db).list_for_facility(ctx.facility_id)


@router.patch("/{device_id}", response_model=DeviceRead)
async def update_device(
    device_id: UUID, payload: DeviceUpdate, db: DB,
    ctx: CurrentContextDep, _user: CurrentUserDep,
) -> DeviceRead:
    """Atualiza nome e/ou vínculo (painel/totem). Aceita ``null``
    explícito pra desvincular. Facility do device é verificada."""
    svc = DeviceService(db)
    device = await svc._get_or_404(device_id)  # noqa: SLF001
    if device.facility_id is not None and str(device.facility_id) != str(ctx.facility_id):
        raise HTTPException(
            status_code=403,
            detail="Só é possível editar dispositivos da unidade atual.",
        )
    return await svc.update(
        device_id, payload, sent_fields=payload.model_fields_set,
    )


@router.delete("/{device_id}", status_code=204)
async def revoke_device(
    device_id: UUID, db: DB, ctx: CurrentContextDep, user: CurrentUserDep,
) -> Response:
    svc = DeviceService(db)
    device = await svc._get_or_404(device_id)  # noqa: SLF001 — intencional
    if device.facility_id is not None and str(device.facility_id) != str(ctx.facility_id):
        raise HTTPException(
            status_code=403,
            detail="Só é possível revogar dispositivos da unidade atual.",
        )
    await svc.revoke(device_id, actor_user_id=user.id)
    await write_audit(
        db,
        module="devices",
        action="revoked",
        severity="info",
        resource="Device",
        resource_id=str(device_id),
        description=f"Dispositivo revogado: {device.name or '(sem nome)'}",
    )
    # Notifica o device em tempo real (ele fecha WS e volta pra pareamento).
    if device.facility_id is not None:
        from app.modules.devices.hub import publish_facility_event
        from app.core.deps import _valkey_client
        await publish_facility_event(
            _valkey_client(), device.facility_id,
            "device:revoked", {"deviceId": str(device_id)},
        )
    return Response(status_code=204)


# ─── WebSocket ───────────────────────────────────────────────────────────────

@router.websocket("/ws")
async def device_ws(websocket: WebSocket, token: str) -> None:
    """Conexão WebSocket do device. Query param ``?token=XXX`` é o
    ``device_token`` emitido no pareamento. Sem token válido, fecha com
    4401 (não autorizado).

    Após aceitar, registra a conexão no hub local (indexada por
    ``facility_id`` + ``device_id``). Mensagens do device são ignoradas
    por enquanto (ping/pong via framing do navegador já basta); eventos
    backend→device vêm do canal Redis ``device:fac:{id}``.
    """
    # Autentica com session efêmera. Usa sua própria session porque
    # WebSocket não passa pelo middleware HTTP.
    async with get_session() as db:
        svc = DeviceService(db)
        try:
            device = await svc.authenticate_by_token(token)
        except HTTPException:
            await websocket.close(code=4401, reason="invalid token")
            return
        if device.facility_id is None:
            await websocket.close(code=4400, reason="device not paired to facility")
            return
        facility_id = device.facility_id
        device_id = device.id

    await websocket.accept()
    hub = get_hub()
    await hub.register(facility_id, device_id, websocket)
    try:
        # Marca presença: atualiza ``last_seen_at`` ao conectar.
        async with get_session() as db:
            fresh = await db.get(type(device), device_id)
            if fresh is not None:
                from datetime import datetime, timezone
                fresh.last_seen_at = datetime.now(timezone.utc)

        # Loop — ignora mensagens do device; mantém conexão viva até
        # cliente desconectar ou servidor derrubar.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unregister(facility_id, device_id, websocket)
