"""Testes da cifra simétrica (Fernet) usada pra secrets em repouso."""

from __future__ import annotations

import pytest

from app.core.crypto import (
    CryptoError,
    decrypt_secret,
    encrypt_secret,
    fingerprint_secret,
    is_encrypted,
    last4,
)


def test_encrypt_then_decrypt_roundtrip() -> None:
    plain = "minha-senha-cadsus-super-secreta"
    token = encrypt_secret(plain)
    assert token.startswith("fernet:v1:")
    assert decrypt_secret(token) == plain


def test_empty_stays_empty() -> None:
    assert encrypt_secret("") == ""
    assert encrypt_secret(None) == ""
    assert decrypt_secret("") == ""
    assert decrypt_secret(None) == ""


def test_encrypt_is_not_deterministic() -> None:
    """Fernet inclui nonce aleatório — mesma entrada gera tokens diferentes."""
    a = encrypt_secret("x")
    b = encrypt_secret("x")
    assert a != b
    assert decrypt_secret(a) == decrypt_secret(b) == "x"


def test_idempotent_encrypt() -> None:
    """Cifrar um token já cifrado retorna o mesmo token (não re-cifra)."""
    token = encrypt_secret("x")
    assert encrypt_secret(token) == token


def test_decrypt_plaintext_returns_as_is() -> None:
    """Durante rollout gradual, valores ainda não migrados precisam funcionar."""
    assert decrypt_secret("texto-em-claro") == "texto-em-claro"


def test_is_encrypted() -> None:
    assert is_encrypted(encrypt_secret("y"))
    assert not is_encrypted("y")
    assert not is_encrypted("")
    assert not is_encrypted(None)


def test_invalid_token_raises() -> None:
    with pytest.raises(CryptoError):
        decrypt_secret("fernet:v1:obviamente-invalido")


def test_fingerprint_is_deterministic() -> None:
    assert fingerprint_secret("abc") == fingerprint_secret("abc")
    assert fingerprint_secret("abc") != fingerprint_secret("abd")
    assert len(fingerprint_secret("abc")) == 16


def test_last4() -> None:
    assert last4("sk-abcdefg1234") == "1234"
    assert last4("xy") == ""
