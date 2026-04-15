"""Dependências FastAPI comuns.

- get_db: sessão async por request com commit/rollback automático.
- get_valkey: cliente Redis/Valkey compartilhado.
- current_user: valida o bearer token e retorna o usuário.
- current_context: valida o token de contexto (header X-Work-Context) e retorna o WorkContext.
- requires(module, action): guard de permissão.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
import redis.asyncio as redis
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import update_audit_context
from app.core.config import settings
from app.core.security import decode_token
from app.db.session import sessionmaker

_bearer = HTTPBearer(auto_error=False)


# ─── DB ────────────────────────────────────────────────────────────────────


async def get_db() -> AsyncIterator[AsyncSession]:
    async with sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DB = Annotated[AsyncSession, Depends(get_db)]


# ─── Valkey ───────────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _valkey_client() -> redis.Redis:
    return redis.from_url(settings.valkey_url, decode_responses=True)


async def get_valkey() -> redis.Redis:
    return _valkey_client()


Valkey = Annotated[redis.Redis, Depends(get_valkey)]


# ─── Auth ─────────────────────────────────────────────────────────────────


class CurrentUser:
    """Usuário extraído do access token."""

    __slots__ = ("id", "login", "name", "token_version")

    def __init__(self, *, id: UUID, login: str, name: str, token_version: int) -> None:
        self.id = id
        self.login = login
        self.name = name
        self.token_version = token_version


async def current_user(
    db: DB,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token ausente.")
    try:
        payload = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado.") from None
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido.") from None

    if payload.get("typ") != "access":
        raise HTTPException(status_code=401, detail="Tipo de token inválido.")

    from app.modules.users.models import User  # evita import circular

    user_id = UUID(payload["sub"])
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário inválido.")
    if user.token_version != payload.get("ver", 0):
        raise HTTPException(status_code=401, detail="Token revogado.")

    update_audit_context(user_id=user.id)

    return CurrentUser(id=user.id, login=user.login, name=user.name, token_version=user.token_version)


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]


# ─── Work Context ────────────────────────────────────────────────────────


class WorkContext:
    __slots__ = (
        "user_id", "municipality_id", "municipality_ibge",
        "facility_id", "role", "modules",
    )

    def __init__(
        self,
        *,
        user_id: UUID,
        municipality_id: UUID,
        municipality_ibge: str,
        facility_id: UUID,
        role: str,
        modules: list[str],
    ) -> None:
        self.user_id = user_id
        self.municipality_id = municipality_id
        self.municipality_ibge = municipality_ibge
        self.facility_id = facility_id
        self.role = role
        self.modules = modules


async def current_context(
    user: CurrentUserDep,
    x_work_context: Annotated[str | None, Header(alias="X-Work-Context")] = None,
) -> WorkContext:
    if not x_work_context:
        raise HTTPException(status_code=400, detail="Cabeçalho X-Work-Context ausente.")
    try:
        payload = decode_token(x_work_context)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Contexto expirado. Selecione novamente.") from None
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Contexto inválido.") from None

    if payload.get("typ") != "context":
        raise HTTPException(status_code=400, detail="Tipo de token de contexto inválido.")
    if payload.get("sub") != str(user.id):
        raise HTTPException(status_code=403, detail="Contexto pertence a outro usuário.")

    ctx = WorkContext(
        user_id=UUID(payload["sub"]),
        municipality_id=UUID(payload["mun"]),
        municipality_ibge=str(payload.get("ibge", "")),
        facility_id=UUID(payload["fac"]),
        role=payload["role"],
        modules=list(payload.get("mods", [])),
    )

    update_audit_context(
        municipality_id=ctx.municipality_id,
        municipality_ibge=ctx.municipality_ibge or None,
        facility_id=ctx.facility_id,
        role=ctx.role,
    )

    return ctx


CurrentContextDep = Annotated[WorkContext, Depends(current_context)]


# ─── Guards ──────────────────────────────────────────────────────────────


def requires(*, module: str) -> object:
    """Guard que exige que o contexto ativo inclua `module`."""

    async def _dep(ctx: CurrentContextDep) -> WorkContext:
        if module not in ctx.modules:
            raise HTTPException(status_code=403, detail=f"Acesso ao módulo {module} não permitido.")
        return ctx

    return Depends(_dep)


# ─── Request raw (ip, user-agent) ────────────────────────────────────────


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
