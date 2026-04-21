"""WebSocket endpoint de usuário — base pra notificações real-time."""

from __future__ import annotations

from uuid import UUID

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.modules.users.hub import get_user_hub

router = APIRouter(prefix="/users", tags=["users"])


@router.websocket("/ws")
async def user_ws(websocket: WebSocket, token: str) -> None:
    """Conexão WS do usuário autenticado. ``?token=<access_token>`` (JWT).

    Close codes:
    - ``4401``: token inválido/expirado
    - ``1001``: shutdown do servidor (graceful)
    """
    try:
        claims = decode_token(token)
    except jwt.PyJWTError:
        await websocket.close(code=4401, reason="invalid token")
        return

    sub = claims.get("sub")
    if not sub:
        await websocket.close(code=4401, reason="invalid token")
        return
    try:
        user_id = UUID(sub)
    except ValueError:
        await websocket.close(code=4401, reason="invalid token")
        return

    await websocket.accept()
    hub = get_user_hub()
    conn_id = await hub.register(user_id, websocket)
    try:
        # Loop — ignora mensagens do cliente; mantém conexão aberta.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unregister(user_id, conn_id)
