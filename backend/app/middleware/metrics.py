"""Middleware de métricas Prometheus.

Captura automaticamente latência, contagem e status de todos os requests HTTP.
Normaliza paths para evitar explosão de cardinalidade (ex: /users/uuid → /users/{id}).
"""

from __future__ import annotations

import re
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.metrics import (
    HTTP_REQUEST_DURATION,
    HTTP_REQUESTS_IN_PROGRESS,
    HTTP_REQUESTS_TOTAL,
)

# Regex para normalizar UUIDs e IDs numéricos em paths
_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
_NUM_ID_RE = re.compile(r"/\d+(?=/|$)")

# Paths que não precisam de métricas detalhadas
_SKIP_PATHS = frozenset({"/health", "/metrics", "/openapi.json", "/docs", "/redoc"})


def _normalize_path(path: str) -> str:
    """Substitui IDs dinâmicos por placeholders para evitar alta cardinalidade."""
    if path in _SKIP_PATHS:
        return path
    path = _UUID_RE.sub("{id}", path)
    path = _NUM_ID_RE.sub("/{id}", path)
    return path


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        method = request.method
        path = _normalize_path(request.url.path)

        HTTP_REQUESTS_IN_PROGRESS.labels(method=method).inc()
        start = time.perf_counter()

        try:
            response = await call_next(request)
            status = str(response.status_code)
        except Exception:
            status = "500"
            raise
        finally:
            duration = time.perf_counter() - start
            HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status=status).inc()
            HTTP_REQUEST_DURATION.labels(method=method, path=path).observe(duration)
            HTTP_REQUESTS_IN_PROGRESS.labels(method=method).dec()

        return response
