"""Protocolo que toda integração de TTS precisa implementar."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class SynthesizeResult:
    audio_bytes: bytes
    mime_type: str  # "audio/mpeg" | "audio/ogg" | ...
    # Alguns providers devolvem, outros não. Frontend usa pra pre-alocar
    # o timing da fila (opcional).
    duration_ms: int | None = None


@dataclass
class VoiceInfo:
    external_id: str
    name: str
    language: str
    gender: str | None
    description: str | None
    sample_url: str | None


class TtsError(Exception):
    """Erro de negócio (chave inválida, quota, etc.) — vira 4xx na UI."""

    def __init__(self, message: str, *, code: str = "tts_error") -> None:
        super().__init__(message)
        self.code = code


class TtsProvider(Protocol):
    """Interface comum pros provedores."""

    name: str  # "elevenlabs" | "google"

    async def synthesize(
        self, *, text: str, voice_external_id: str, language: str = "pt-BR",
        speed: float = 1.0,
    ) -> SynthesizeResult:
        """Gera o áudio. ``speed`` 0.25 — 4.0 (1.0 = natural).
        Levanta ``TtsError`` em falhas."""
        ...

    async def test_key(self) -> bool:
        """Valida a credencial (chamada leve, ex.: GET user)."""
        ...

    async def list_voices(self, language: str = "pt-BR") -> list[VoiceInfo]:
        """Lista as vozes disponíveis pro catálogo do admin."""
        ...
