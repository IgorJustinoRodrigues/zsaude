"""Middleware de gravação automática de audit logs.

Captura toda requisição HTTP mutante (POST/PATCH/PUT/DELETE) em /api/v1/* e
grava um `AuditLog`. Alguns endpoints (login, refresh, logout) são
ignorados aqui porque têm logging explícito no service de auth — assim
podemos registrar falhas com severidade correta e incluir o identifier
tentado mesmo quando o user_id ainda não existe.

O middleware nunca pode bloquear o request: qualquer erro é engolido.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger
from app.modules.audit.writer import write_audit

log = get_logger(__name__)


MUTATING_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

# Endpoints que fazem seu próprio logging (evita duplicação).
SKIP_PATHS = (
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
)

# Prefixo de path → módulo. Ordem importa (mais específico primeiro).
PATH_TO_MODULE: list[tuple[str, str]] = [
    ("/api/v1/admin/",           "SYS"),
    ("/api/v1/system/",          "SYS"),
    ("/api/v1/users",            "SYS"),
    ("/api/v1/municipalities",   "SYS"),
    ("/api/v1/facilities",       "SYS"),
    ("/api/v1/audit",            "SYS"),
    ("/api/v1/work-context",     "AUTH"),
    ("/api/v1/auth/",            "AUTH"),
    ("/api/v1/cln/",             "CLN"),
    ("/api/v1/dgn/",             "DGN"),
    ("/api/v1/hsp/",             "HSP"),
    ("/api/v1/pln/",             "PLN"),
    ("/api/v1/fsc/",             "FSC"),
    ("/api/v1/ops/",             "OPS"),
]


def _module_for(path: str) -> str:
    for prefix, module in PATH_TO_MODULE:
        if path.startswith(prefix):
            return module
    return "API"


# Mapeia sufixo de URL a uma ação específica (sobrescreve o método).
# Ex: POST .../archive → action=delete (arquivamento é remoção lógica)
URL_SUFFIX_ACTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"/reset-password$"),  "password_reset"),
    (re.compile(r"/activate$"),        "permission_change"),
    (re.compile(r"/deactivate$"),      "permission_change"),
    (re.compile(r"/block$"),           "block_user"),
    (re.compile(r"/archive$"),         "delete"),
    (re.compile(r"/unarchive$"),       "edit"),
    (re.compile(r"/work-context/select$"), "view"),
]


METHOD_TO_ACTION: dict[str, str] = {
    "POST":   "create",
    "PATCH":  "edit",
    "PUT":    "edit",
    "DELETE": "delete",
}


def _action_for(method: str, path: str) -> str:
    for pat, action in URL_SUFFIX_ACTIONS:
        if pat.search(path):
            return action
    return METHOD_TO_ACTION.get(method, "other")


def _severity_for(status_code: int, action: str) -> str:
    if status_code >= 500:
        return "error"
    if status_code >= 400:
        return "warning"
    if action in {"block_user", "delete"}:
        return "warning"
    if action == "password_reset":
        return "warning"
    return "info"


# Recurso inferido a partir do path. Busca o "penúltimo segmento significativo"
# (antes de qualquer ID/sufixo), com singular heurístico.
RESOURCE_BY_SEGMENT = {
    "municipalities":  "Municipality",
    "facilities":      "Facility",
    "users":           "User",
    "settings":        "Setting",
    "work-context":    "WorkContext",
    "audit":           "AuditLog",
}


def _resource_for(path: str) -> tuple[str, str]:
    """Retorna (resource, resource_id). resource_id vazio se não inferido."""
    parts = [p for p in path.split("/") if p and p != "api" and p != "v1"]
    # Ex: ['admin', 'municipalities', '<uuid>', 'archive']
    # Ex: ['users', '<uuid>']
    # Ex: ['system', 'settings', 'app_name']

    resource = ""
    resource_id = ""

    # Varre da direita pra esquerda, encontra um par segmento-chave + id
    idx = len(parts) - 1
    while idx >= 0:
        seg = parts[idx]
        if seg in RESOURCE_BY_SEGMENT:
            resource = RESOURCE_BY_SEGMENT[seg]
            # próximo segmento à direita é o id candidato (se houver e não for verbo)
            if idx + 1 < len(parts):
                nxt = parts[idx + 1]
                if not nxt.startswith("(") and nxt not in {"archive", "unarchive", "activate", "deactivate", "block", "reset-password", "select", "current", "options", "stats", "novo"}:
                    resource_id = nxt
            break
        idx -= 1
    return resource, resource_id


PATH_DESCRIPTION: list[tuple[re.Pattern[str], str]] = [
    # Sistema / MASTER
    (re.compile(r"/admin/municipalities/[^/]+/archive$"),   "Arquivou município"),
    (re.compile(r"/admin/municipalities/[^/]+/unarchive$"), "Reativou município"),
    (re.compile(r"^.*?/admin/municipalities/[^/]+$"),       "Editou município"),
    (re.compile(r"^.*?/admin/municipalities$"),             "Cadastrou município"),
    (re.compile(r"/admin/facilities/[^/]+/archive$"),       "Arquivou unidade"),
    (re.compile(r"/admin/facilities/[^/]+/unarchive$"),     "Reativou unidade"),
    (re.compile(r"^.*?/admin/facilities/[^/]+$"),           "Editou unidade"),
    (re.compile(r"^.*?/admin/facilities$"),                 "Cadastrou unidade"),
    # System settings
    (re.compile(r"/system/settings/[^/]+$"),                "Alterou configuração"),
    # Users
    (re.compile(r"/users/[^/]+/reset-password$"),           "Redefiniu senha de usuário"),
    (re.compile(r"/users/[^/]+/activate$"),                 "Ativou usuário"),
    (re.compile(r"/users/[^/]+/deactivate$"),               "Inativou usuário"),
    (re.compile(r"/users/[^/]+/block$"),                    "Bloqueou usuário"),
    (re.compile(r"^.*?/users/me$"),                         "Atualizou próprio perfil"),
    (re.compile(r"^.*?/users/[^/]+$"),                      "Editou usuário"),
    (re.compile(r"^.*?/users$"),                            "Cadastrou usuário"),
    # Auth/work-context
    (re.compile(r"/work-context/select$"),                  "Selecionou contexto de trabalho"),
    (re.compile(r"/auth/change-password$"),                 "Alterou a própria senha"),
]


def _describe(method: str, path: str) -> str:
    for pat, desc in PATH_DESCRIPTION:
        if pat.search(path):
            return desc
    # fallback genérico
    verb = {"POST": "Criou", "PATCH": "Editou", "PUT": "Atualizou", "DELETE": "Removeu"}.get(method, "Ação em")
    return f"{verb} recurso em {path}"


class AuditWriterMiddleware(BaseHTTPMiddleware):
    """Registra automaticamente cada mutação HTTP."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response: Response | None = None
        error: Exception | None = None
        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001
            error = exc

        # Só audita mutações em /api/v1/*
        path = request.url.path
        method = request.method.upper()
        is_mutating = method in MUTATING_METHODS
        is_api = path.startswith("/api/v1")
        is_skipped = any(path.startswith(p) for p in SKIP_PATHS)

        if is_mutating and is_api and not is_skipped:
            status_code = response.status_code if response is not None else 500
            action = _action_for(method, path)
            module = _module_for(path)
            severity = _severity_for(status_code, action)
            resource, resource_id = _resource_for(path)
            description = _describe(method, path)
            details: dict[str, Any] = {
                "method": method,
                "path": path,
                "status": status_code,
                "query": str(request.url.query or ""),
            }
            await self._write_safe(
                module=module,
                action=action,
                severity=severity,
                resource=resource,
                resource_id=resource_id,
                description=description,
                details=details,
            )

        if error is not None:
            raise error  # deixa os handlers globais tratarem
        assert response is not None
        return response

    async def _write_safe(self, **kwargs: Any) -> None:
        """Escrita best-effort — auditoria nunca derruba o request."""
        try:
            # Abre uma sessão independente do request (pode ter rollback).
            from app.db.session import sessionmaker as session_factory

            maker: async_sessionmaker = session_factory()
            async with maker() as s:
                await write_audit(s, **kwargs)
                await s.commit()
        except Exception as exc:  # noqa: BLE001
            log.warning("audit_write_failed", error=str(exc), kwargs=kwargs)
