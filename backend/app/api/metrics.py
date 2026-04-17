"""Endpoint /metrics para Prometheus scraping."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

router = APIRouter(tags=["monitoring"])


@router.get("/metrics", response_class=PlainTextResponse)
async def prometheus_metrics():
    """Expõe métricas no formato Prometheus text."""
    return PlainTextResponse(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
