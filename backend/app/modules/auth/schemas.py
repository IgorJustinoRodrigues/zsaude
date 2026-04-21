"""Schemas de autenticação."""

from __future__ import annotations

from pydantic import EmailStr, Field, field_validator

from app.core.schema_base import CamelModel
from app.core.validators import validate_password_strength


class LoginRequest(CamelModel):
    login: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class TokenPair(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int  # segundos até expirar o access


class RefreshRequest(CamelModel):
    refresh_token: str


class LogoutRequest(CamelModel):
    refresh_token: str


class ForgotPasswordRequest(CamelModel):
    email: EmailStr


class ResetPasswordRequest(CamelModel):
    token: str
    new_password: str = Field(max_length=200)

    @field_validator("new_password")
    @classmethod
    def _check_pwd(cls, v: str) -> str:
        return validate_password_strength(v)


class ChangePasswordRequest(CamelModel):
    # Obrigatório no fluxo normal de troca. Opcional quando o usuário está
    # usando senha provisória (``must_change_password=True``) — nesse caso
    # a senha já foi validada no login e não faz sentido pedir de novo.
    current_password: str | None = None
    new_password: str = Field(max_length=200)

    @field_validator("new_password")
    @classmethod
    def _check_pwd(cls, v: str) -> str:
        return validate_password_strength(v)


class ConfirmEmailRequest(CamelModel):
    token: str


class MessageResponse(CamelModel):
    message: str
