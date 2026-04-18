"""Endpoints de autenticação."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.deps import DB, CurrentUserDep, client_ip
from app.core.logging import get_logger
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    ResetPasswordRequest,
    TokenPair,
)
from app.modules.auth.service import AuthService
from app.modules.system.service import get_int_sync
from app.modules.users.schemas import UserRead, user_read_from_orm
from app.modules.users.service import UserService

log = get_logger(__name__)
limiter = Limiter(key_func=get_remote_address)


def _login_rate_limit() -> str:
    """Lê ``login_rate_limit_per_min`` das settings (fallback: 5/min)."""
    return f"{get_int_sync('login_rate_limit_per_min', 5)}/minute"


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
@limiter.limit(_login_rate_limit)
async def login(
    request: Request,
    payload: LoginRequest,
    db: DB,
) -> TokenPair:
    svc = AuthService(db)
    ip = client_ip(request)
    ua = request.headers.get("user-agent", "")
    return await svc.login(payload.login, payload.password, ip, ua)


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    request: Request,
    payload: RefreshRequest,
    db: DB,
) -> TokenPair:
    svc = AuthService(db)
    ip = client_ip(request)
    ua = request.headers.get("user-agent", "")
    return await svc.refresh(payload.refresh_token, ip, ua)


@router.post("/logout", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def logout(payload: LogoutRequest, db: DB) -> MessageResponse:
    await AuthService(db).logout(payload.refresh_token)
    return MessageResponse(message="Logout realizado.")


@router.get("/me", response_model=UserRead)
async def me(db: DB, user: CurrentUserDep) -> UserRead:
    record = await UserService(db).get_or_404(user.id)
    return user_read_from_orm(record)


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("3/hour")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: DB,
) -> MessageResponse:
    svc = AuthService(db)
    token = await svc.forgot_password(payload.email, client_ip(request))
    if token:
        # TODO: enviar email via MailHog/SMTP (ARQ job). Por ora, logar (dev only).
        log.info("password_reset_issued", email=payload.email, token_preview=token[:8] + "...")
    # Resposta sempre genérica, não revela se e-mail existe
    return MessageResponse(
        message="Se o e-mail existir, enviaremos instruções para redefinir a senha."
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: DB) -> MessageResponse:
    await AuthService(db).reset_password(payload.token, payload.new_password)
    return MessageResponse(message="Senha redefinida com sucesso.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordRequest,
    db: DB,
    user: CurrentUserDep,
) -> MessageResponse:
    record = await UserService(db).get_or_404(user.id)
    await AuthService(db).change_password(record, payload.current_password, payload.new_password)
    return MessageResponse(message="Senha alterada.")
