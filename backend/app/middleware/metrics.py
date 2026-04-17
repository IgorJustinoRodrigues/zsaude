"""Middleware de métricas Prometheus.

Captura automaticamente latência, contagem e status de todos os requests HTTP.
Extrai o município ativo do header X-Work-Context para métricas por município.
Normaliza paths para evitar explosão de cardinalidade.
"""

from __future__ import annotations

import re
import time

import jwt
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.metrics import (
    HTTP_REQUEST_DURATION,
    HTTP_REQUESTS_IN_PROGRESS,
    HTTP_REQUESTS_TOTAL,
)

_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
_NUM_ID_RE = re.compile(r"/\d+(?=/|$)")
_SKIP_PATHS = frozenset({"/health", "/metrics", "/openapi.json", "/docs", "/redoc"})


def _normalize_path(path: str) -> str:
    if path in _SKIP_PATHS:
        return path
    path = _UUID_RE.sub("{id}", path)
    path = _NUM_ID_RE.sub("/{id}", path)
    return path


def _extract_municipality(request: Request) -> str:
    """Extrai IBGE do município do X-Work-Context JWT (sem validar assinatura)."""
    ctx_token = request.headers.get("x-work-context")
    if not ctx_token:
        return "global"
    try:
        payload = jwt.decode(ctx_token, options={"verify_signature": False})
        return str(payload.get("ibge", "")) or "global"
    except Exception:
        return "global"


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        method = request.method
        path = _normalize_path(request.url.path)
        municipality = _extract_municipality(request)

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
            HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status=status, municipality=municipality).inc()
            HTTP_REQUEST_DURATION.labels(method=method, path=path, municipality=municipality).observe(duration)
            HTTP_REQUESTS_IN_PROGRESS.labels(method=method).dec()

        return response
