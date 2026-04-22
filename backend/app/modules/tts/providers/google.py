"""Integração com Google Cloud Text-to-Speech.

Autenticação via **service account JSON**. O admin cola o JSON inteiro
no campo "API key" da UI; o backend criptografa e armazena em
``tts_provider_keys.api_key_encrypted``.

No runtime:
1. Parse do JSON
2. Gera JWT assertion assinado com a private_key
3. Troca por access_token (cache em memória por 1h)
4. Chama ``/v1/text:synthesize``

Referência:
- https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize
- Auth: https://developers.google.com/identity/protocols/oauth2/service-account
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from app.modules.tts.providers.base import (
    SynthesizeResult,
    TtsError,
    VoiceInfo,
)


_TOKEN_URL = "https://oauth2.googleapis.com/token"
_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
_VOICES_URL = "https://texttospeech.googleapis.com/v1/voices"
_SCOPE = "https://www.googleapis.com/auth/cloud-platform"

# Cache de access_token por ``private_key_id`` (1h de validade).
# Process-local — funciona pra um worker. Multi-worker cada um tem o
# seu; perda marginal de eficiência, mas sem complicação de distributed
# cache. Se virar gargalo, move pro Valkey.
_token_cache: dict[str, tuple[str, int]] = {}
_token_lock = asyncio.Lock()


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _parse_sa(raw: str) -> dict[str, Any]:
    try:
        sa = json.loads(raw)
    except json.JSONDecodeError as e:
        raise TtsError(
            "Credencial Google inválida — cole o JSON completo da service account.",
            code="invalid_key",
        ) from e
    for field in ("private_key", "client_email", "token_uri", "private_key_id"):
        if not sa.get(field):
            raise TtsError(
                f"JSON da service account incompleto (falta '{field}').",
                code="invalid_key",
            )
    return sa


def _sign_jwt(sa: dict[str, Any]) -> str:
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT", "kid": sa["private_key_id"]}
    claim = {
        "iss": sa["client_email"],
        "scope": _SCOPE,
        "aud": sa["token_uri"],
        "exp": now + 3600,
        "iat": now,
    }
    signing_input = (
        _b64u(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64u(json.dumps(claim, separators=(",", ":")).encode())
    )
    priv = serialization.load_pem_private_key(
        sa["private_key"].encode(), password=None,
    )
    sig = priv.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())  # type: ignore[union-attr]
    return signing_input + "." + _b64u(sig)


async def _get_access_token(sa: dict[str, Any]) -> str:
    key_id = sa["private_key_id"]
    now = int(time.time())
    cached = _token_cache.get(key_id)
    if cached and cached[1] > now + 60:
        return cached[0]

    async with _token_lock:
        # Double-check após adquirir o lock.
        cached = _token_cache.get(key_id)
        if cached and cached[1] > now + 60:
            return cached[0]

        assertion = _sign_jwt(sa)
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.post(sa["token_uri"], data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            })
        if r.status_code == 401:
            raise TtsError(
                "Service account rejeitada (chave revogada ou inválida).",
                code="invalid_key",
            )
        if r.status_code >= 400:
            raise TtsError(
                f"Falha ao obter token Google ({r.status_code}): {r.text[:200]}",
                code="provider_error",
            )
        data = r.json()
        access = data["access_token"]
        expires_in = int(data.get("expires_in", 3600))
        _token_cache[key_id] = (access, now + expires_in)
        return access


def _friendly_error(response: httpx.Response) -> str:
    try:
        data = response.json()
    except Exception:
        return f"Falha no provedor ({response.status_code})."
    err = (data or {}).get("error") or {}
    status = err.get("status", "")
    msg = err.get("message", "")
    if status == "PERMISSION_DENIED":
        return "Text-to-Speech API não habilitada no projeto Google Cloud."
    if status == "UNAUTHENTICATED":
        return "Credencial Google não autenticada (revise a service account)."
    if status == "INVALID_ARGUMENT" and "voice" in msg.lower():
        return "Voz inexistente no Google Cloud TTS."
    if status == "RESOURCE_EXHAUSTED":
        return "Cota do Google Cloud TTS esgotada."
    if response.status_code >= 500:
        return "Google Cloud TTS com instabilidade — tente novamente."
    if msg and len(msg) < 200:
        return msg
    return f"Falha no provedor ({response.status_code})."


class GoogleProvider:
    name = "google"

    def __init__(self, service_account_json: str) -> None:
        # Parse eager: falha já na construção se o JSON estiver quebrado.
        self._sa = _parse_sa(service_account_json)

    async def synthesize(
        self, *, text: str, voice_external_id: str, language: str = "pt-BR",
        speed: float = 1.0,
    ) -> SynthesizeResult:
        token = await _get_access_token(self._sa)

        # Google usa nome da voz (ex.: pt-BR-Neural2-C) e infere o languageCode
        # do prefixo. Mas o campo languageCode é obrigatório — derivamos dele.
        language_code = language if "-" in language else f"{language}-BR"
        if voice_external_id.startswith("pt-BR"):
            language_code = "pt-BR"

        payload = {
            "input": {"text": text},
            "voice": {"languageCode": language_code, "name": voice_external_id},
            "audioConfig": {
                "audioEncoding": "MP3",
                "speakingRate": speed,  # Google aceita 0.25 — 4.0
            },
        }
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                _TTS_URL,
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
            )
        if r.status_code >= 400:
            raise TtsError(_friendly_error(r), code="provider_error")

        audio_b64 = r.json().get("audioContent")
        if not audio_b64:
            raise TtsError(
                "Resposta do Google sem áudio.", code="provider_error",
            )
        return SynthesizeResult(
            audio_bytes=base64.b64decode(audio_b64),
            mime_type="audio/mpeg",
        )

    async def test_key(self) -> bool:
        try:
            await _get_access_token(self._sa)
            return True
        except Exception:
            return False

    async def list_voices(self, language: str = "pt-BR") -> list[VoiceInfo]:
        token = await _get_access_token(self._sa)
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(
                _VOICES_URL,
                headers={"Authorization": f"Bearer {token}"},
                params={"languageCode": language},
            )
        if r.status_code >= 400:
            raise TtsError(_friendly_error(r), code="provider_error")
        out: list[VoiceInfo] = []
        for v in r.json().get("voices", []):
            name = v.get("name", "")
            gender = (v.get("ssmlGender") or "").lower()
            # Converte "MALE"/"FEMALE" → "male"/"female".
            gender_out = gender if gender in ("male", "female") else None
            out.append(VoiceInfo(
                external_id=name,
                name=name,
                language=language,
                gender=gender_out,
                description=None,
                sample_url=None,
            ))
        return out


# Classmethod conveniente pra instanciar direto da row do DB.
def build_from_encrypted(encrypted_key: str) -> GoogleProvider:
    """O helper já deve ter chamado ``decrypt_secret``; aqui recebe o
    JSON em texto plano e constrói o provider."""
    return GoogleProvider(service_account_json=encrypted_key)
