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


def _friendly_error(response: httpx.Response) -> str:
    """Converte erros do ElevenLabs em mensagens legíveis pro usuário."""
    try:
        data = response.json()
    except Exception:
        return f"Falha no provedor ({response.status_code})."

    detail = (data or {}).get("detail") or {}
    status = detail.get("status", "") if isinstance(detail, dict) else ""
    msg = detail.get("message", "") if isinstance(detail, dict) else str(detail)

    # Mapeamento dos erros mais comuns.
    if status == "invalid_voice_settings":
        if "speed" in msg.lower():
            return "Velocidade fora do intervalo aceito (0.7 a 1.2)."
        return f"Configurações da voz inválidas: {msg}"
    if status == "voice_not_found":
        return "Voz não encontrada no provedor (pode ter sido removida)."
    if status == "voice_limit_reached":
        return "Limite de vozes do plano atingido."
    if status == "quota_exceeded" or response.status_code == 429:
        return "Cota de caracteres do plano esgotada. Aguarde renovação ou faça upgrade."
    if status == "invalid_api_key":
        return "Chave de API inválida."
    if response.status_code == 402:
        return "Assinatura expirada ou pagamento pendente no provedor."
    if response.status_code >= 500:
        return "Provedor com instabilidade — tente novamente em alguns instantes."

    # Fallback: usa a mensagem do provider diretamente se for curta.
    if msg and len(msg) < 200:
        return msg
    return f"Falha no provedor ({response.status_code})."


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
        speed: float = 1.0,
    ) -> SynthesizeResult:
        payload = {
            "text": text,
            "model_id": self._model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True,
                "speed": speed,
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
                # Tenta extrair mensagem útil do payload estruturado.
                friendly = _friendly_error(r)
                raise TtsError(friendly, code="provider_error")
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
