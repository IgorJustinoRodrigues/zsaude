"""Schemas de autenticação."""

from __future__ import annotations

from pydantic import EmailStr, Field

from app.core.schema_base import CamelModel


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
    new_password: str = Field(min_length=8, max_length=200)


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class MessageResponse(CamelModel):
    message: str
