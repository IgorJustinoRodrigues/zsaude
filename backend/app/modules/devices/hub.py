"""Hub de conexões WebSocket pra devices, ponte pra Valkey pub/sub.

Cada device abre um WS em ``/devices/ws?token=...``. O hub mantém:

- Um dicionário em memória ``{ facility_id: {device_id: WebSocket} }``
  com as conexões ativas deste processo.
- Uma task em background que faz ``SUBSCRIBE`` no Valkey no padrão
  ``device:fac:*`` — e ao receber mensagem, faz fan-out pras conexões
  locais daquele facility.

Pra publicar de qualquer lugar (ex.: console do balcão clicando "chamar
próximo"), usa-se ``publish_facility_event``, que só faz ``PUBLISH`` no
Valkey. O hub (em todos os workers) repassa.

Formato da mensagem Redis: JSON com ``{event, payload}``. Ex.:

    publish_facility_event(valkey, fac_id, "painel:call", {ticket:"R-047",...})

No cliente, cada device filtra pelos eventos que lhe interessam.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any
from uuid import UUID

import redis.asyncio as redis
from fastapi import WebSocket

logger = logging.getLogger(__name__)

_CHANNEL_PREFIX = "device:fac:"


def _channel(facility_id: UUID) -> str:
    return f"{_CHANNEL_PREFIX}{facility_id}"


class DeviceHub:
    """Singleton por processo. Criado em startup, fechado em shutdown."""

    def __init__(self, valkey: redis.Redis):
        self.valkey = valkey
        self._conns: dict[UUID, dict[UUID, WebSocket]] = defaultdict(dict)
        self._pubsub_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def start(self) -> None:
        self._pubsub_task = asyncio.create_task(self._run_pubsub(), name="device-hub-pubsub")

    async def stop(self) -> None:
        if self._pubsub_task is not None:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
            self._pubsub_task = None
        # Fecha todas as conexões.
        for conns in list(self._conns.values()):
            for ws in list(conns.values()):
                await ws.close(code=1001, reason="server shutdown")
        self._conns.clear()

    # ── Registro de conexões ──────────────────────────────────────────

    async def register(self, facility_id: UUID, device_id: UUID, ws: WebSocket) -> None:
        async with self._lock:
            # Se já havia uma conexão pro mesmo device, fecha a antiga
            # (troca de aba, reconnect, etc).
            prev = self._conns[facility_id].get(device_id)
            if prev is not None and prev is not ws:
                try:
                    await prev.close(code=1008, reason="replaced")
                except Exception:
                    pass
            self._conns[facility_id][device_id] = ws

    async def unregister(self, facility_id: UUID, device_id: UUID, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._conns.get(facility_id)
            if conns and conns.get(device_id) is ws:
                conns.pop(device_id, None)
            if conns is not None and not conns:
                self._conns.pop(facility_id, None)

    def devices_online(self, facility_id: UUID) -> set[UUID]:
        return set(self._conns.get(facility_id, {}).keys())

    # ── Envio ─────────────────────────────────────────────────────────

    async def _broadcast_local(
        self, facility_id: UUID, event: str, payload: dict[str, Any],
    ) -> None:
        conns = self._conns.get(facility_id, {})
        if not conns:
            return
        msg = json.dumps({"event": event, "payload": payload})
        dead: list[tuple[UUID, WebSocket]] = []
        for dev_id, ws in conns.items():
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append((dev_id, ws))
        # Limpa conexões mortas que o unregister não pegou.
        for dev_id, ws in dead:
            await self.unregister(facility_id, dev_id, ws)

    # ── Pub/sub com Valkey ────────────────────────────────────────────

    async def _run_pubsub(self) -> None:
        pubsub = self.valkey.pubsub()
        await pubsub.psubscribe(f"{_CHANNEL_PREFIX}*")
        logger.info("device hub subscribed to %s*", _CHANNEL_PREFIX)
        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "pmessage":
                    continue
                channel = msg.get("channel", "")
                if not channel.startswith(_CHANNEL_PREFIX):
                    continue
                try:
                    fac_id = UUID(channel[len(_CHANNEL_PREFIX):])
                except ValueError:
                    continue
                try:
                    data = json.loads(msg.get("data", "{}"))
                except json.JSONDecodeError:
                    continue
                event = data.get("event")
                payload = data.get("payload", {})
                if event:
                    await self._broadcast_local(fac_id, event, payload)
        except asyncio.CancelledError:
            await pubsub.punsubscribe(f"{_CHANNEL_PREFIX}*")
            await pubsub.aclose()
            raise
        except Exception:
            logger.exception("device hub pubsub loop crashed")


# ─── API pública (publicar eventos) ────────────────────────────────────────

async def publish_facility_event(
    valkey: redis.Redis, facility_id: UUID, event: str, payload: dict[str, Any],
) -> None:
    """Publica um evento no canal da unidade. Qualquer worker com WS
    conectado pra devices dessa unidade vai receber e repassar."""
    msg = json.dumps({"event": event, "payload": payload})
    await valkey.publish(_channel(facility_id), msg)


# ─── Singleton (montado no main.py) ────────────────────────────────────────

_hub: DeviceHub | None = None


def get_hub() -> DeviceHub:
    if _hub is None:
        raise RuntimeError("DeviceHub não inicializado — chamar init_hub() no startup.")
    return _hub


def init_hub(valkey: redis.Redis) -> DeviceHub:
    global _hub
    if _hub is None:
        _hub = DeviceHub(valkey)
    return _hub
