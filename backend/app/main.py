"""Factory do app FastAPI."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.health import router as health_router
from app.api.v1 import api_v1
from app.core.config import settings
from app.core.exceptions import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_error_handler,
)
from app.core.logging import configure_logging, get_logger
from app.core.permissions.seed import ensure_system_base_roles, sync_permissions
from app.db.session import dispose_engine, engine, sessionmaker
from app.modules.system.service import SettingsService
from app.middleware.audit_context import AuditContextMiddleware
from app.middleware.audit_writer import AuditWriterMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.modules.auth.router import limiter


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    log = get_logger("app.lifespan")
    log.info("startup", env=settings.env, api_prefix=settings.api_v1_prefix)
    # inicializa engine cedo
    engine()
    # Sincroniza catálogo de permissões (registry → DB) e SYSTEM roles base.
    # Idempotente — barato o bastante para rodar a cada boot.
    try:
        async with sessionmaker()() as session:
            n_perms = await sync_permissions(session)
            n_roles = await ensure_system_base_roles(session)
            n_settings = await SettingsService(session).warm_up()
            await session.commit()
            log.info(
                "rbac_sync_ok",
                permissions=n_perms,
                system_roles=n_roles,
                settings_loaded=n_settings,
            )
    except Exception as e:  # noqa: BLE001
        log.error("rbac_sync_failed", error=str(e))
    import asyncio

    # Cria partições futuras do ai_usage_logs. Idempotente, roda em ~50ms.
    try:
        async with sessionmaker()() as session:
            from app.modules.ai.partitions import ensure_partitions
            await ensure_partitions(session)
            await session.commit()
    except Exception as e:  # noqa: BLE001
        log.warning("ai_partitions_failed", error=str(e))

    # Aquece o modelo de reconhecimento facial em background.
    from app.services.face import warm as warm_face

    asyncio.create_task(warm_face())

    try:
        yield
    finally:
        log.info("shutdown")
        await dispose_engine()


def create_app() -> FastAPI:
    app = FastAPI(
        title="zSaúde API",
        version="0.1.0",
        description="API do zSaúde — gestão de saúde municipal.",
        lifespan=lifespan,
        openapi_url="/openapi.json" if not settings.is_prod else None,
        docs_url="/docs" if not settings.is_prod else None,
        redoc_url="/redoc" if not settings.is_prod else None,
    )

    # Rate limiter (slowapi)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Middlewares (ordem: último adicionado = primeiro a rodar no inbound)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Work-Context", "X-Request-Id"],
        expose_headers=["X-Request-Id"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    # AuditWriter precisa ver o AuditContext já populado (ip, ua, user, facility)
    app.add_middleware(AuditWriterMiddleware)
    app.add_middleware(AuditContextMiddleware)
    app.add_middleware(RequestIdMiddleware)

    # Handlers
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # Rotas
    app.include_router(health_router)
    app.include_router(api_v1, prefix=settings.api_v1_prefix)

    return app


app = create_app()
