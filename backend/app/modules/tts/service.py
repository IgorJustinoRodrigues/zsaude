"""Serviço TTS — resolve voz, cacheia fragmentos, integra com provider.

Fluxo do ``prepare_phrases``:
1. Resolve voz (voiceId explícito → config efetiva → default global)
2. Resolve provider + credencial (provider ativo do sys + chave)
3. Pra cada frase:
   - hash = sha256(voice_external_id + ":" + text)
   - SELECT em ``tts_audio_cache``
   - HIT → devolve URL presignada do storage_key
   - MISS → synthesize via provider, upload ao bucket, insere row, URL

Unique constraint em ``text_hash`` cuida de race: segundo INSERT falha,
a sessão retenta o SELECT (acontece raramente).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret, encrypt_secret, last4
from app.core.logging import get_logger
from app.modules.tts.models import TtsAudioCache, TtsProviderKey, TtsVoice
from app.modules.tts.providers.base import TtsError
from app.modules.tts.providers.elevenlabs import ElevenLabsProvider
from app.services.storage import get_storage

log = get_logger(__name__)


# ─── Dados resolvidos pro runtime ──────────────────────────────────

@dataclass
class _ResolvedVoice:
    voice_id: UUID
    provider: str
    external_id: str
    language: str


@dataclass
class PreparedAudio:
    text: str
    url: str
    duration_ms: int | None
    from_cache: bool


# ─── Service ────────────────────────────────────────────────────────

class TtsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─── Admin: keys ──────────────────────────────────────────────

    async def upsert_global_key(self, provider: str, api_key: str) -> TtsProviderKey:
        """MASTER grava/atualiza a chave global do provedor."""
        # Desativa chaves anteriores globais desse provider.
        existing = await self.db.scalar(
            select(TtsProviderKey)
            .where(TtsProviderKey.provider == provider)
            .where(TtsProviderKey.scope_type == "global")
            .where(TtsProviderKey.active == True)  # noqa: E712
            .limit(1)
        )
        if existing is not None:
            existing.api_key_encrypted = encrypt_secret(api_key)
            await self.db.flush()
            return existing
        row = TtsProviderKey(
            provider=provider,
            scope_type="global",
            scope_id=None,
            api_key_encrypted=encrypt_secret(api_key),
            active=True,
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def get_global_key(self, provider: str) -> TtsProviderKey | None:
        return await self.db.scalar(
            select(TtsProviderKey)
            .where(TtsProviderKey.provider == provider)
            .where(TtsProviderKey.scope_type == "global")
            .where(TtsProviderKey.active == True)  # noqa: E712
            .limit(1)
        )

    async def delete_global_key(self, provider: str) -> None:
        row = await self.get_global_key(provider)
        if row is not None:
            await self.db.delete(row)
            await self.db.flush()

    def preview_key(self, row: TtsProviderKey) -> str:
        try:
            plain = decrypt_secret(row.api_key_encrypted)
            return f"••••{last4(plain)}"
        except Exception:
            return "••••"

    # ─── Admin: default voice ─────────────────────────────────────

    async def get_default_voice(self) -> TtsVoice | None:
        return await self.db.scalar(
            select(TtsVoice)
            .where(TtsVoice.is_default == True)  # noqa: E712
            .where(TtsVoice.archived == False)  # noqa: E712
            .limit(1)
        )

    async def set_default_voice(self, voice_id: UUID) -> TtsVoice:
        """Marca a voz como default. Desmarca a anterior. O provedor
        ativo fica implícito — é o provider da voz default."""
        voice = await self.get_voice(voice_id)
        if voice is None or voice.archived:
            raise HTTPException(status_code=404, detail="Voz não encontrada.")
        # Desmarca anterior
        current = await self.get_default_voice()
        if current and current.id != voice.id:
            current.is_default = False
            await self.db.flush()
        voice.is_default = True
        await self.db.flush()
        return voice

    async def get_active_provider(self) -> str | None:
        """Provedor ativo = o da voz default. None quando nenhuma voz
        foi marcada como default ainda."""
        voice = await self.get_default_voice()
        return voice.provider if voice else None

    # ─── Vozes ───────────────────────────────────────────────────

    async def list_voices(
        self, provider: str | None = None, available_only: bool = False,
    ) -> list[TtsVoice]:
        stmt = select(TtsVoice).where(TtsVoice.archived == False)  # noqa: E712
        if provider:
            stmt = stmt.where(TtsVoice.provider == provider)
        if available_only:
            stmt = stmt.where(TtsVoice.available_for_selection == True)  # noqa: E712
        stmt = stmt.order_by(TtsVoice.display_order, TtsVoice.name)
        return list((await self.db.scalars(stmt)).all())

    async def get_voice(self, voice_id: UUID) -> TtsVoice | None:
        return await self.db.get(TtsVoice, voice_id)

    # ─── Resolve voz efetiva ─────────────────────────────────────

    async def resolve_voice(
        self, voice_id: UUID | None,
    ) -> _ResolvedVoice:
        """Se ``voice_id`` explícito, usa. Senão pega a default do sistema."""
        if voice_id:
            voice = await self.get_voice(voice_id)
        else:
            voice = await self.get_default_voice()
        if voice is None or voice.archived:
            raise HTTPException(
                status_code=409,
                detail="Nenhuma voz configurada. Peça pro admin configurar em Sys → TTS.",
            )
        return _ResolvedVoice(
            voice_id=voice.id,
            provider=voice.provider,
            external_id=voice.external_id,
            language=voice.language,
        )

    # ─── Provider ────────────────────────────────────────────────

    async def _get_provider(self, provider_name: str) -> ElevenLabsProvider:
        key_row = await self.get_global_key(provider_name)
        if key_row is None:
            raise HTTPException(
                status_code=409,
                detail=f"Credencial não configurada pra provider '{provider_name}'.",
            )
        api_key = decrypt_secret(key_row.api_key_encrypted)
        if provider_name == "elevenlabs":
            return ElevenLabsProvider(api_key=api_key)
        raise HTTPException(
            status_code=501,
            detail=f"Provider '{provider_name}' ainda não implementado.",
        )

    async def test_provider_key(
        self, provider_name: str, api_key: str,
    ) -> bool:
        """Valida uma chave sem salvar — usado pelo admin pra testar."""
        if provider_name == "elevenlabs":
            provider = ElevenLabsProvider(api_key=api_key)
            try:
                return await provider.test_key()
            except Exception:
                return False
        return False

    # ─── Core: prepare ───────────────────────────────────────────

    async def prepare_phrases(
        self, voice_id: UUID | None, phrases: list[str],
    ) -> tuple[_ResolvedVoice, list[PreparedAudio]]:
        """Dado uma lista de frases, devolve URLs pra cada uma (cache
        first, gera o que falta). Ordem preservada."""
        voice = await self.resolve_voice(voice_id)
        provider = await self._get_provider(voice.provider)
        storage = get_storage()

        out: list[PreparedAudio] = []
        for text in phrases:
            text_norm = (text or "").strip()
            if not text_norm:
                raise HTTPException(status_code=400, detail="Frase vazia.")

            text_hash = _hash_phrase(voice.external_id, text_norm)

            cached = await self.db.scalar(
                select(TtsAudioCache).where(TtsAudioCache.text_hash == text_hash)
            )

            if cached is not None:
                # Cache hit — devolve URL presignada do storage.
                url = await storage.presigned_url(cached.storage_key, expires=86400 * 7)
                out.append(PreparedAudio(
                    text=text_norm,
                    url=url,
                    duration_ms=cached.duration_ms,
                    from_cache=True,
                ))
                continue

            # Cache miss — sintetiza, upload, insere row.
            try:
                result = await provider.synthesize(
                    text=text_norm,
                    voice_external_id=voice.external_id,
                    language=voice.language,
                )
            except TtsError as e:
                raise HTTPException(status_code=422, detail={"code": e.code, "message": str(e)}) from e

            storage_key = _storage_key_for(voice.external_id, text_hash)
            await storage.upload(storage_key, result.audio_bytes, result.mime_type)

            row = TtsAudioCache(
                provider=voice.provider,
                voice_external_id=voice.external_id,
                language=voice.language,
                text=text_norm,
                text_hash=text_hash,
                storage_key=storage_key,
                file_size=len(result.audio_bytes),
                duration_ms=result.duration_ms,
                fragment_kind=_classify_fragment(text_norm),
            )
            self.db.add(row)
            try:
                await self.db.flush()
            except Exception:
                # Corrida — alguém inseriu paralelo. Releia.
                await self.db.rollback()
                cached = await self.db.scalar(
                    select(TtsAudioCache).where(TtsAudioCache.text_hash == text_hash)
                )
                if cached is None:
                    raise
                storage_key = cached.storage_key

            url = await storage.presigned_url(storage_key, expires=86400 * 7)
            out.append(PreparedAudio(
                text=text_norm,
                url=url,
                duration_ms=result.duration_ms,
                from_cache=False,
            ))

            log.info(
                "tts_generated",
                voice=voice.external_id,
                chars=len(text_norm),
                text=text_norm[:60],
            )

        return voice, out


# ─── Helpers ────────────────────────────────────────────────────────

def _hash_phrase(voice_external_id: str, text: str) -> str:
    payload = f"{voice_external_id}:{text}".encode()
    return hashlib.sha256(payload).hexdigest()


def _storage_key_for(voice_external_id: str, text_hash: str) -> str:
    """Pasta por voz pra facilitar manutenção futura (ex.: apagar cache
    de uma voz que foi removida do catálogo)."""
    return f"tts/{voice_external_id}/{text_hash[:16]}.mp3"


def _classify_fragment(text: str) -> str:
    """Heurística bobinha só pra pôr uma tag no banco (debug/métrica)."""
    t = text.lower().strip()
    if t.startswith("atenção") or t.startswith("atencao"):
        return "alert"
    if t.startswith("senha"):
        return "ticket"
    if t.startswith("guichê") or t.startswith("guiche") or t.startswith("balcão"):
        return "counter"
    return "name_or_custom"
