"""Health check: DB + Valkey."""

from __future__ import annotations

import redis.asyncio as redis
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.db.session import sessionmaker

router = APIRouter(tags=["health"])


@router.get("/health", include_in_schema=False)
async def health() -> JSONResponse:
    db_ok = False
    valkey_ok = False

    try:
        async with sessionmaker()() as s:
            await s.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    try:
        client = redis.from_url(settings.valkey_url, decode_responses=True)
        await client.ping()
        await client.aclose()
        valkey_ok = True
    except Exception:
        valkey_ok = False

    code = status.HTTP_200_OK if db_ok and valkey_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=code,
        content={
            "status": "ok" if db_ok and valkey_ok else "degraded",
            "db": "ok" if db_ok else "down",
            "valkey": "ok" if valkey_ok else "down",
        },
    )
