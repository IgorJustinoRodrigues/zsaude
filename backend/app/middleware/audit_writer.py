"""Middleware de gravação automática de audit logs.

Captura toda requisição HTTP mutante (POST/PATCH/PUT/DELETE) em /api/v1/* e
grava um `AuditLog`. Alguns endpoints (login, refresh, logout) são
ignorados aqui porque têm logging explícito no service de auth — assim
podemos registrar falhas com severidade correta e incluir o identifier
tentado mesmo quando o user_id ainda não existe.

O middleware nunca pode bloquear o request: qualquer erro é engolido.
"""

from __future__ import annotations

import json
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

# Endpoints que fazem seu próprio logging com diff detalhado (from/to).
# Nesses casos o middleware pula — o service grava log mais rico.
SKIP_PATHS: tuple[str, ...] = (
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
)

# Endpoints que têm log explícito detalhado no service. O middleware pula
# para evitar duplicação (o service já registra os campos com ``from``/``to``).
SKIP_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"/api/v1/system/settings/[^/]+$"),
    re.compile(r"/api/v1/roles(?:/[^/]+(?:/permissions|/archive|/unarchive)?)?$"),
    re.compile(r"/api/v1/admin/roles(?:/[^/]+(?:/permissions|/archive|/unarchive)?)?$"),
    re.compile(r"/api/v1/users/[^/]+/accesses/[^/]+/permissions$"),
    re.compile(r"/api/v1/admin/users/[^/]+/accesses/[^/]+/permissions$"),
    # PATCH de usuário tem log detalhado no UserService.update.
    re.compile(r"/api/v1/users/[^/]+$"),
    re.compile(r"/api/v1/admin/municipalities/[^/]+$"),
    re.compile(r"/api/v1/admin/facilities/[^/]+$"),
)


# Limite de bytes do body salvos no audit. Evita logs gigantes em payload
# grande (ex.: upload base64). Acima disso, salva só metadado.
_MAX_BODY_BYTES = 32 * 1024

# Chaves que podem conter segredo. Substituídas por "***" em qualquer
# profundidade do payload.
_SENSITIVE_KEYS = {
    "password", "newpassword", "new_password",
    "currentpassword", "current_password", "old_password",
    "token", "refreshtoken", "refresh_token",
    "reset_token", "access_token", "context_token",
    "pepper", "secret",
}


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: ("***" if k.lower().replace("-", "").replace("_", "") in _SENSITIVE_KEYS
                else _redact(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_redact(x) for x in value]
    return value


def _parse_body(raw: bytes, content_type: str) -> Any:
    """Parse best-effort do body para incluir no audit.

    - JSON → dict/list (com redact de senhas).
    - form-encoded → ignora (pode conter senha).
    - texto grande ou binário → metadado.
    """
    if not raw:
        return None
    if len(raw) > _MAX_BODY_BYTES:
        return {"__truncated__": True, "size": len(raw)}
    ct = content_type.lower()
    if "json" in ct:
        try:
            data = json.loads(raw.decode("utf-8"))
            return _redact(data)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {"__invalid_json__": True, "size": len(raw)}
    if "form" in ct or "multipart" in ct:
        return {"__form__": True, "size": len(raw)}
    try:
        return raw.decode("utf-8")[:2000]
    except UnicodeDecodeError:
        return {"__binary__": True, "size": len(raw)}

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
    """Registra automaticamente cada mutação HTTP, com body da requisição.

    Sensibilidade: campos de senha/token são mascarados antes de gravar.
    Payloads acima de 32KB são registrados só com tamanho.

    Endpoints que fazem logging explícito com diff detalhado (settings,
    permissões) são pulados via ``SKIP_PATTERNS`` para evitar duplicação.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        method = request.method.upper()
        is_mutating = method in MUTATING_METHODS
        is_api = path.startswith("/api/v1")
        is_skipped = any(path.startswith(p) for p in SKIP_PATHS) or any(
            p.search(path) for p in SKIP_PATTERNS
        )

        # Captura o body ANTES do endpoint consumir (request só pode ser
        # lido uma vez). Reinstala via _receive para o handler receber OK.
        body_payload: Any = None
        if is_mutating and is_api and not is_skipped:
            try:
                raw = await request.body()
                async def _receive() -> dict[str, Any]:
                    return {"type": "http.request", "body": raw, "more_body": False}
                request._receive = _receive  # type: ignore[attr-defined]
                body_payload = _parse_body(raw, request.headers.get("content-type", ""))
            except Exception:  # noqa: BLE001
                body_payload = {"__read_error__": True}

        response: Response | None = None
        error: Exception | None = None
        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001
            error = exc

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
            if body_payload is not None:
                details["body"] = body_payload
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
            raise error
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
