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
from typing import TYPE_CHECKING, Annotated
from uuid import UUID

if TYPE_CHECKING:
    from app.modules.permissions.service import ResolvedPermissions

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

    update_audit_context(user_id=user.id, user_name=user.name)

    # Presença: toca last_seen_at da sessão (throttled a 30s). Só funciona
    # para tokens emitidos após a feature de sessões existir (que carregam sid).
    sid = payload.get("sid")
    if sid:
        try:
            from app.modules.sessions.service import SessionService

            await SessionService(db).touch(UUID(sid), user_id=user.id)
        except Exception:  # noqa: BLE001
            pass  # presença nunca pode quebrar o request

    return CurrentUser(id=user.id, login=user.login, name=user.name, token_version=user.token_version)


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]


# ─── Work Context ────────────────────────────────────────────────────────


class WorkContext:
    __slots__ = (
        "user_id", "municipality_id", "municipality_ibge",
        "facility_id", "facility_access_id",
        "role", "modules", "permissions",
    )

    def __init__(
        self,
        *,
        user_id: UUID,
        municipality_id: UUID,
        municipality_ibge: str,
        facility_id: UUID,
        facility_access_id: UUID | None,
        role: str,
        modules: list[str],
        permissions: "ResolvedPermissions",
    ) -> None:
        self.user_id = user_id
        self.municipality_id = municipality_id
        self.municipality_ibge = municipality_ibge
        self.facility_id = facility_id
        self.facility_access_id = facility_access_id
        self.role = role
        self.modules = modules
        self.permissions = permissions

    def has(self, permission_code: str) -> bool:
        return permission_code in self.permissions


async def current_context(
    db: DB,
    valkey: Valkey,
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

    facility_id = UUID(payload["fac"])

    # Resolve acesso + permissões fresco a cada request. A fonte de verdade
    # é o banco, não o token — assim mudanças em role/override propagam sem
    # precisar renovar o X-Work-Context.
    from app.modules.permissions.service import PermissionService

    perm_svc = PermissionService(db, valkey)
    access, permissions = await perm_svc.resolve_for_facility(user.id, facility_id)
    if access is None:
        raise HTTPException(status_code=403, detail="Acesso à unidade revogado.")

    # Módulos derivados das permissões (intersecção com módulos operacionais).
    # MASTER sempre enxerga todos os operacionais, mesmo os que ainda não
    # têm permissões registradas no catálogo.
    if permissions.is_root:
        derived_modules = sorted(_OPERATIONAL_MODULES)
    else:
        derived_modules = sorted(permissions.modules() & _OPERATIONAL_MODULES)

    ctx = WorkContext(
        user_id=user.id,
        municipality_id=UUID(payload["mun"]),
        municipality_ibge=str(payload.get("ibge", "")),
        facility_id=facility_id,
        facility_access_id=access.id,
        role=str(payload.get("role", "")),
        modules=derived_modules,
        permissions=permissions,
    )

    update_audit_context(
        municipality_id=ctx.municipality_id,
        municipality_ibge=ctx.municipality_ibge or None,
        facility_id=ctx.facility_id,
        role=ctx.role,
    )

    return ctx


CurrentContextDep = Annotated[WorkContext, Depends(current_context)]


# Módulos "operacionais" — os que aparecem no switcher de módulo da UI.
# Outros módulos (sys, users, roles, audit) existem no catálogo mas não são
# selecionáveis como contexto de trabalho.
_OPERATIONAL_MODULES: frozenset[str] = frozenset({"cln", "dgn", "hsp", "pln", "fsc", "ops"})


# ─── Guards ──────────────────────────────────────────────────────────────


def requires(
    *,
    module: str | None = None,
    permission: str | None = None,
    any_of: list[str] | None = None,
) -> object:
    """Guard que exige permissão/módulo no contexto ativo.

    Escolha **uma** forma:
    - ``permission="cln.patient.edit"`` → checagem fina (recomendado).
    - ``any_of=["cln.patient.view", "cln.patient.edit"]`` → qualquer uma.
    - ``module="cln"`` → qualquer permissão do módulo (derivado).
    """
    if permission is None and module is None and any_of is None:
        raise ValueError("requires() precisa de 'permission', 'any_of' ou 'module'.")

    async def _dep(ctx: CurrentContextDep) -> WorkContext:
        if permission is not None and permission not in ctx.permissions:
            raise HTTPException(status_code=403, detail=f"Sem permissão: {permission}.")
        if any_of is not None and not ctx.permissions.has_any(*any_of):
            raise HTTPException(status_code=403, detail="Sem permissão.")
        if module is not None and not ctx.permissions.has_any_in_module(module):
            raise HTTPException(status_code=403, detail=f"Acesso ao módulo {module} não permitido.")
        return ctx

    return Depends(_dep)


# ─── Request raw (ip, user-agent) ────────────────────────────────────────


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─── Level guards ────────────────────────────────────────────────────────────


async def require_master(db: DB, user: CurrentUserDep) -> CurrentUser:
    """Só usuários MASTER passam. Usado nos endpoints de plataforma."""
    from app.modules.users.models import User, UserLevel

    record = await db.scalar(select(User).where(User.id == user.id))
    if record is None or record.level != UserLevel.MASTER:
        raise HTTPException(status_code=403, detail="Requer nível MASTER.")
    return user


async def require_admin_or_master(db: DB, user: CurrentUserDep) -> CurrentUser:
    from app.modules.users.models import User, UserLevel

    record = await db.scalar(select(User).where(User.id == user.id))
    if record is None or record.level not in (UserLevel.ADMIN, UserLevel.MASTER):
        raise HTTPException(status_code=403, detail="Requer nível ADMIN ou MASTER.")
    return user


MasterDep = Annotated[CurrentUser, Depends(require_master)]
AdminOrMasterDep = Annotated[CurrentUser, Depends(require_admin_or_master)]
