"""Cifra simétrica pra secrets em repouso (API keys, credenciais SOAP, etc).

Usa Fernet (AES-128 CBC + HMAC-SHA256) da biblioteca cryptography. Tokens
gerados aqui têm prefixo ``fernet:v1:`` pra permitir:

- Detectar em migrations se um valor já foi cifrado (idempotência).
- Versionar o formato no futuro (``fernet:v2:`` com nova chave/algoritmo).

A chave vem de ``SECRETS_ENCRYPTION_KEY`` (32 bytes base64-url). Em dev
pode ser gerada com ``python -c 'from cryptography.fernet import Fernet;
print(Fernet.generate_key().decode())'``.
"""

from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_TOKEN_PREFIX = "fernet:v1:"


class CryptoError(Exception):
    """Falha ao cifrar/decifrar — chave errada ou token corrompido."""


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = settings.secrets_encryption_key
    if not key:
        raise CryptoError(
            "SECRETS_ENCRYPTION_KEY não configurada. Gere uma com:\n"
            "  python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        )
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as e:
        raise CryptoError(f"SECRETS_ENCRYPTION_KEY inválida: {e}") from e


def is_encrypted(value: str | None) -> bool:
    """True se o valor já tem o prefixo de token cifrado."""
    return bool(value) and value.startswith(_TOKEN_PREFIX)  # type: ignore[union-attr]


def encrypt_secret(plain: str | None) -> str:
    """Cifra ``plain``. String vazia/None passa direto (útil pra "sem senha")."""
    if not plain:
        return ""
    if is_encrypted(plain):
        # Já cifrado — evita dupla-cifra se caller chamar por engano.
        return plain
    token = _fernet().encrypt(plain.encode("utf-8")).decode("ascii")
    return f"{_TOKEN_PREFIX}{token}"


def decrypt_secret(token: str | None) -> str:
    """Decifra. Vazio/None vira ''. Texto sem prefixo é retornado como-está
    (suporta rollout gradual: valores ainda não migrados continuam legíveis)."""
    if not token:
        return ""
    if not is_encrypted(token):
        return token
    raw = token[len(_TOKEN_PREFIX):]
    try:
        return _fernet().decrypt(raw.encode("ascii")).decode("utf-8")
    except InvalidToken as e:
        raise CryptoError("Token inválido — chave errada ou token corrompido.") from e


def fingerprint_secret(plain: str) -> str:
    """Hash curto (sha256[:16]) pra exibir em UI/logs sem vazar o valor.

    Determinístico: mesma entrada → mesma saída. Útil pra auditoria de rotação
    (ver se chave atual é a mesma de ontem) e comparação sem decifrar.
    """
    import hashlib

    return hashlib.sha256(plain.encode("utf-8")).hexdigest()[:16]


def last4(plain: str) -> str:
    """Últimos 4 caracteres, pra exibir como 'sk-...abcd' em UIs admin."""
    return plain[-4:] if len(plain) >= 4 else ""
