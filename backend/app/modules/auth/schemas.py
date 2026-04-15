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

    _check_pwd = field_validator("new_password")(lambda _, v: validate_password_strength(v))


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str = Field(max_length=200)

    _check_pwd = field_validator("new_password")(lambda _, v: validate_password_strength(v))


class MessageResponse(CamelModel):
    message: str
