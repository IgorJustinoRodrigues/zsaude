"""DTOs do módulo TTS."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


Provider = Literal["elevenlabs", "google"]


# ─── Catálogo de vozes ───────────────────────────────────────────────

class VoiceRead(CamelModel):
    id: UUID
    provider: Provider
    external_id: str
    name: str
    language: str
    gender: str | None = None
    description: str | None = None
    sample_url: str | None = None
    available_for_selection: bool
    archived: bool
    display_order: int
    speed: float = 0.9


class VoiceUpdate(CamelModel):
    name: str | None = Field(default=None, max_length=120)
    description: str | None = None
    gender: str | None = Field(default=None, max_length=20)
    sample_url: str | None = Field(default=None, max_length=500)
    available_for_selection: bool | None = None
    archived: bool | None = None
    display_order: int | None = None
    # ``speed`` é fixo por voz (ajustado por curadoria do sistema, não
    # pelo admin) — não aceita via API pra evitar desalinhamento entre
    # municípios e queimar cota de créditos com re-geração.


# ─── Credenciais ─────────────────────────────────────────────────────

class ProviderKeyRead(CamelModel):
    id: UUID
    provider: Provider
    scope_type: Literal["global", "municipality"]
    scope_id: UUID | None = None
    active: bool
    # Nunca expõe a chave crua — só um preview (últimos 4 dígitos).
    api_key_preview: str
    extra_config: dict | None = None


class ProviderKeyInput(CamelModel):
    # Limite alto pra acomodar JSON de service account (Google ~2.5k chars).
    # ElevenLabs é ~60 chars.
    api_key: str = Field(min_length=8, max_length=8000)
    extra_config: dict | None = None


# ─── Runtime ─────────────────────────────────────────────────────────

class PrepareInput(CamelModel):
    """Frontend manda as frases que quer tocar em sequência. Backend
    devolve URLs pra cada uma (cache first, API só quando falta)."""

    # Se omitido, usa a voz efetiva (defaults → município → unidade)
    # do work-context (ou do device).
    voice_id: UUID | None = None
    phrases: list[str] = Field(min_length=1, max_length=20)


class AudioOut(CamelModel):
    text: str
    url: str
    duration_ms: int | None = None
    from_cache: bool


class PrepareOutput(CamelModel):
    voice_external_id: str
    provider: Provider
    audios: list[AudioOut]


class ActiveProviderInfo(CamelModel):
    """Qual provider está ativo globalmente + status da credencial."""

    provider: Provider | None = None
    has_key: bool = False
