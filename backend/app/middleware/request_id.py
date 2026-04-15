"""Middleware de request-id.

- Lê X-Request-Id do cliente ou gera um novo (UUID4 hex).
- Propaga no contextvar do structlog para todos os logs do request.
- Devolve X-Request-Id no response.
"""

from __future__ import annotations

import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.audit import update_audit_context

HEADER = "X-Request-Id"


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        req_id = request.headers.get(HEADER) or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=req_id)
        update_audit_context(request_id=req_id)
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("request_id")
        response.headers[HEADER] = req_id
        return response
