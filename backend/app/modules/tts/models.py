"""Models do módulo TTS."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import JSONType, UUIDType, new_uuid7


class TtsProviderKey(Base, TimestampedMixin):
    """Credencial dum provedor de TTS. ``scope='global'`` vira default;
    ``scope='municipality'`` permite um município ter chave/conta própria
    (hoje opcional)."""

    __tablename__ = "tts_provider_keys"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)  # elevenlabs|google
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False, default="global")
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    extra_config: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]


class TtsVoice(Base, TimestampedMixin):
    """Catálogo de vozes disponíveis. Admin marca ``available_for_selection``
    pra controlar quais aparecem na UI de seleção (município/unidade)."""

    __tablename__ = "tts_voices"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="pt-BR")
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sample_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    available_for_selection: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]


class TtsAudioCache(Base):
    """Cada fragmento gerado vai pra cá. Content-addressed por hash do
    ``(voice_external_id, text)`` — mesmo texto com mesma voz = mesmo
    áudio, reuso infinito. Storage key segue padrão
    ``tts/{voice_external_id}/{hash_prefix}.mp3`` pra facilitar manutenção."""

    __tablename__ = "tts_audio_cache"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    voice_external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    public_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fragment_kind: Mapped[str] = mapped_column(String(30), nullable=False, default="custom")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=sa_text("CURRENT_TIMESTAMP"),
    )
