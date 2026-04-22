"""Integração com ElevenLabs."""

from __future__ import annotations

import httpx

from app.modules.tts.providers.base import (
    SynthesizeResult,
    TtsError,
    VoiceInfo,
)

_BASE_URL = "https://api.elevenlabs.io"
_DEFAULT_MODEL = "eleven_multilingual_v2"


class ElevenLabsProvider:
    name = "elevenlabs"

    def __init__(self, api_key: str, *, model_id: str = _DEFAULT_MODEL) -> None:
        self._api_key = api_key
        self._model_id = model_id

    def _client(self, *, timeout: float = 30.0) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=_BASE_URL,
            headers={"xi-api-key": self._api_key},
            timeout=timeout,
        )

    async def synthesize(
        self, *, text: str, voice_external_id: str, language: str = "pt-BR",
    ) -> SynthesizeResult:
        payload = {
            "text": text,
            "model_id": self._model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True,
            },
        }
        async with self._client() as c:
            r = await c.post(
                f"/v1/text-to-speech/{voice_external_id}",
                json=payload,
                headers={"Accept": "audio/mpeg"},
            )
            if r.status_code == 401:
                raise TtsError("Chave ElevenLabs inválida.", code="invalid_key")
            if r.status_code == 429:
                raise TtsError(
                    "Cota de caracteres excedida no ElevenLabs.",
                    code="quota_exceeded",
                )
            if r.status_code >= 400:
                raise TtsError(
                    f"ElevenLabs falhou ({r.status_code}): {r.text[:200]}",
                    code="provider_error",
                )
            return SynthesizeResult(
                audio_bytes=r.content,
                mime_type=r.headers.get("content-type", "audio/mpeg"),
            )

    async def test_key(self) -> bool:
        async with self._client(timeout=10.0) as c:
            r = await c.get("/v1/user")
            return r.status_code == 200

    async def list_voices(self, language: str = "pt-BR") -> list[VoiceInfo]:
        # Catálogo compartilhado da ElevenLabs (shared library). Filtra
        # por accent quando possível.
        async with self._client(timeout=20.0) as c:
            r = await c.get(
                "/v2/voices",
                params={"language": "pt", "page_size": 100},
            )
            if r.status_code >= 400:
                raise TtsError(
                    f"Falha ao listar vozes ({r.status_code}).",
                    code="provider_error",
                )
            data = r.json()
            out: list[VoiceInfo] = []
            for v in data.get("voices", []):
                labels = v.get("labels") or {}
                out.append(VoiceInfo(
                    external_id=v["voice_id"],
                    name=v.get("name", ""),
                    language=language,
                    gender=labels.get("gender"),
                    description=(labels.get("descriptive")
                                 or labels.get("description")),
                    sample_url=v.get("preview_url"),
                ))
            return out
