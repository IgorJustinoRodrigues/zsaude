"""Hash de senha (Argon2id + pepper) e helpers JWT (RS256)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2 import exceptions as argon2_exceptions

from app.core.config import settings
from app.modules.system.service import get_int_sync

# ─── Senha ────────────────────────────────────────────────────────────────────

# Parâmetros OWASP 2026
_PH = PasswordHasher(
    time_cost=3,
    memory_cost=64 * 1024,  # 64 MiB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def _peppered(password: str) -> bytes:
    """HMAC-SHA256(pepper, password). Transforma senha em bytes antes do Argon2id.

    Vantagens:
    - Limite de 72 bytes do bcrypt não se aplica (Argon2 aceita qualquer input).
    - Se o DB vazar e o pepper não, hashes não podem ser quebrados.
    """
    return hmac.new(
        settings.password_pepper.encode("utf-8"),
        password.encode("utf-8"),
        hashlib.sha256,
    ).digest()


def hash_password(password: str) -> str:
    return _PH.hash(_peppered(password))


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _PH.verify(hashed, _peppered(password))
    except (argon2_exceptions.VerifyMismatchError, argon2_exceptions.InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    return _PH.check_needs_rehash(hashed)


# ─── JWT ──────────────────────────────────────────────────────────────────────

TokenType = Literal["access", "refresh", "reset", "context"]


def _now_utc() -> datetime:
    return datetime.now(UTC)


def create_access_token(
    subject: str,
    token_version: int = 1,
    family_id: str | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = _now_utc()
    ttl_minutes = get_int_sync("access_token_ttl_minutes", settings.jwt_access_ttl_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
        "jti": uuid.uuid4().hex,
        "typ": "access",
        "ver": token_version,
    }
    if family_id:
        # Identificador da sessão (família de refresh tokens). Usado para
        # atualizar `last_seen_at` nas requisições autenticadas.
        payload["sid"] = family_id
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.read_jwt_private_key(), algorithm=settings.jwt_algorithm)


def create_context_token(
    user_id: str,
    municipality_id: str,
    municipality_ibge: str,
    facility_id: str,
    role: str,
    modules: list[str],
) -> str:
    now = _now_utc()
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.work_context_ttl_minutes)).timestamp()),
        "jti": uuid.uuid4().hex,
        "typ": "context",
        "mun": municipality_id,
        "ibge": municipality_ibge,
        "fac": facility_id,
        "role": role,
        "mods": modules,
    }
    return jwt.encode(payload, settings.read_jwt_private_key(), algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """Decodifica e valida JWT. Lança jwt.PyJWTError se inválido/expirado."""
    return jwt.decode(token, settings.read_jwt_public_key(), algorithms=[settings.jwt_algorithm])


def generate_opaque_token(nbytes: int = 48) -> str:
    """Token opaco (refresh, reset). URL-safe."""
    return secrets.token_urlsafe(nbytes)


def hash_opaque_token(token: str) -> str:
    """Hash SHA-256 para armazenar refresh/reset tokens sem expor o plaintext."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
