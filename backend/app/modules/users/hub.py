"""Hub de conexões WebSocket por usuário.

Paralelo ao ``DeviceHub`` (``app/modules/devices/hub.py``), mas indexado
por ``user_id`` em vez de ``facility_id``. Um usuário pode ter múltiplas
conexões simultâneas (várias abas, celular + desktop) — todas recebem
os eventos.

Canal Valkey: ``user:{user_id}``. Mensagem é JSON ``{event, payload}``.

Eventos publicados hoje:

- ``notification:new``   — nova notificação pessoal criada
- ``notification:read``  — uma notificação foi marcada como lida
- ``notification:all-read`` — todas foram marcadas (botão "ler tudo")
- ``notification:unread-count`` — opcional, serve como atalho de refresh
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import defaultdict
from typing import Any
from uuid import UUID

import redis.asyncio as redis
from fastapi import WebSocket

logger = logging.getLogger(__name__)

_CHANNEL_PREFIX = "user:"


def _channel(user_id: UUID) -> str:
    return f"{_CHANNEL_PREFIX}{user_id}"


class UserHub:
    """Singleton por processo. Inicializado no lifespan do app."""

    def __init__(self, valkey: redis.Redis):
        self.valkey = valkey
        # user_id → { conn_id → WebSocket }. ``conn_id`` é um uuid efêmero
        # por conexão; o mesmo user pode ter N conexões.
        self._conns: dict[UUID, dict[UUID, WebSocket]] = defaultdict(dict)
        self._pubsub_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def start(self) -> None:
        self._pubsub_task = asyncio.create_task(self._run_pubsub(), name="user-hub-pubsub")

    async def stop(self) -> None:
        if self._pubsub_task is not None:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
            self._pubsub_task = None
        for conns in list(self._conns.values()):
            for ws in list(conns.values()):
                try:
                    await ws.close(code=1001, reason="server shutdown")
                except Exception:
                    pass
        self._conns.clear()

    # ── Conexões ──────────────────────────────────────────────────────

    async def register(self, user_id: UUID, ws: WebSocket) -> UUID:
        conn_id = uuid.uuid4()
        async with self._lock:
            self._conns[user_id][conn_id] = ws
        return conn_id

    async def unregister(self, user_id: UUID, conn_id: UUID) -> None:
        async with self._lock:
            conns = self._conns.get(user_id)
            if conns is not None:
                conns.pop(conn_id, None)
                if not conns:
                    self._conns.pop(user_id, None)

    def online_user_ids(self) -> set[UUID]:
        """Conjunto de users com pelo menos 1 WS aberto. Usado em presence."""
        return set(self._conns.keys())

    # ── Envio ─────────────────────────────────────────────────────────

    async def _broadcast_local(
        self, user_id: UUID, event: str, payload: dict[str, Any],
    ) -> None:
        conns = self._conns.get(user_id, {})
        if not conns:
            return
        msg = json.dumps({"event": event, "payload": payload})
        dead: list[UUID] = []
        for conn_id, ws in conns.items():
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(conn_id)
        for cid in dead:
            await self.unregister(user_id, cid)

    # ── Pub/sub ───────────────────────────────────────────────────────

    async def _run_pubsub(self) -> None:
        pubsub = self.valkey.pubsub()
        await pubsub.psubscribe(f"{_CHANNEL_PREFIX}*")
        logger.info("user hub subscribed to %s*", _CHANNEL_PREFIX)
        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "pmessage":
                    continue
                channel = msg.get("channel", "")
                if not channel.startswith(_CHANNEL_PREFIX):
                    continue
                try:
                    user_id = UUID(channel[len(_CHANNEL_PREFIX):])
                except ValueError:
                    continue
                try:
                    data = json.loads(msg.get("data", "{}"))
                except json.JSONDecodeError:
                    continue
                event = data.get("event")
                payload = data.get("payload", {})
                if event:
                    await self._broadcast_local(user_id, event, payload)
        except asyncio.CancelledError:
            await pubsub.punsubscribe(f"{_CHANNEL_PREFIX}*")
            await pubsub.aclose()
            raise
        except Exception:
            logger.exception("user hub pubsub loop crashed")


async def publish_user_event(
    valkey: redis.Redis, user_id: UUID, event: str, payload: dict[str, Any],
) -> None:
    """Publica evento no canal do usuário. Qualquer worker com WS do
    mesmo user conectado recebe e repassa."""
    msg = json.dumps({"event": event, "payload": payload})
    await valkey.publish(_channel(user_id), msg)


# ─── Singleton ─────────────────────────────────────────────────────────

_hub: UserHub | None = None


def get_user_hub() -> UserHub:
    if _hub is None:
        raise RuntimeError("UserHub não inicializado — chame init_user_hub() no startup.")
    return _hub


def init_user_hub(valkey: redis.Redis) -> UserHub:
    global _hub
    if _hub is None:
        _hub = UserHub(valkey)
    return _hub
