"""Preenche AuditContext com IP e user-agent. O user/facility vêm das deps."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.audit import AuditContext, set_audit_context


class AuditContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        ip = request.client.host if request.client else None
        # respeita cabeçalhos de proxy reverso (se confiáveis via config de deploy)
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            ip = fwd.split(",")[0].strip()

        ctx = AuditContext(ip=ip, user_agent=request.headers.get("user-agent"))
        set_audit_context(ctx)
        return await call_next(request)
