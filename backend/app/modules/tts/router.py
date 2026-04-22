"""Endpoints TTS.

- ``POST /rec/tts/prepare`` → runtime (device ou user) resolve frases pra URLs
- ``GET  /rec/tts/voices`` → vozes disponíveis pra seleção (runtime)
- ``/admin/tts/*`` → MASTER gerencia chave, vozes e voz padrão
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException

from app.core.deps import DB, CurrentUserDep, MasterDep
from app.modules.devices.service import DeviceService
from app.modules.tts.schemas import (
    ActiveProviderInfo,
    AudioOut,
    PrepareInput,
    PrepareOutput,
    ProviderKeyInput,
    ProviderKeyRead,
    VoiceRead,
    VoiceUpdate,
)
from app.modules.tts.service import TtsService


router = APIRouter(prefix="/rec/tts", tags=["rec-tts"])
admin_router = APIRouter(prefix="/admin/tts", tags=["admin-tts"])


# ─── Runtime ────────────────────────────────────────────────────────

@router.post("/prepare", response_model=PrepareOutput)
async def prepare(
    payload: PrepareInput,
    db: DB,
    x_device_token: Annotated[str, Header(alias="X-Device-Token")],
) -> PrepareOutput:
    """Painel/totem envia frases → backend devolve URLs (cache first).
    Auth por device token — o runtime normal do painel/totem."""
    await DeviceService(db).authenticate_by_token(x_device_token)

    svc = TtsService(db)
    voice, audios = await svc.prepare_phrases(payload.voice_id, payload.phrases)
    return PrepareOutput(
        voice_external_id=voice.external_id,
        provider=voice.provider,  # type: ignore[arg-type]
        audios=[
            AudioOut(text=a.text, url=a.url, duration_ms=a.duration_ms, from_cache=a.from_cache)
            for a in audios
        ],
    )


@router.get("/voices", response_model=list[VoiceRead])
async def list_voices_runtime(
    db: DB, _user: CurrentUserDep,
) -> list[VoiceRead]:
    """Vozes disponíveis pra seleção (só as marcadas como
    ``available_for_selection`` e do provedor ativo)."""
    svc = TtsService(db)
    active = await svc.get_active_provider()
    voices = await svc.list_voices(provider=active, available_only=True)
    return [_voice_to_read(v) for v in voices]


# ─── Admin MASTER ───────────────────────────────────────────────────

@admin_router.get("/providers/active", response_model=ActiveProviderInfo)
async def get_active_provider(
    db: DB, _master: MasterDep,
) -> ActiveProviderInfo:
    svc = TtsService(db)
    active = await svc.get_active_provider()
    has_key = False
    if active:
        row = await svc.get_global_key(active)
        has_key = row is not None
    return ActiveProviderInfo(provider=active, has_key=has_key)  # type: ignore[arg-type]


@admin_router.get("/providers/{provider}/key", response_model=ProviderKeyRead | None)
async def get_provider_key(
    provider: str, db: DB, _master: MasterDep,
) -> ProviderKeyRead | None:
    svc = TtsService(db)
    row = await svc.get_global_key(provider)
    if row is None:
        return None
    return ProviderKeyRead(
        id=row.id,
        provider=row.provider,  # type: ignore[arg-type]
        scope_type="global",
        scope_id=None,
        active=row.active,
        api_key_preview=svc.preview_key(row),
        extra_config=row.extra_config,
    )


@admin_router.post("/providers/{provider}/key", response_model=ProviderKeyRead)
async def upsert_provider_key(
    provider: str, payload: ProviderKeyInput,
    db: DB, _master: MasterDep,
) -> ProviderKeyRead:
    if provider not in ("elevenlabs", "google"):
        raise HTTPException(status_code=400, detail="Provider inválido.")
    svc = TtsService(db)
    row = await svc.upsert_global_key(provider, payload.api_key)
    return ProviderKeyRead(
        id=row.id,
        provider=row.provider,  # type: ignore[arg-type]
        scope_type="global",
        scope_id=None,
        active=row.active,
        api_key_preview=svc.preview_key(row),
        extra_config=row.extra_config,
    )


@admin_router.delete("/providers/{provider}/key", status_code=204)
async def delete_provider_key(
    provider: str, db: DB, _master: MasterDep,
) -> None:
    svc = TtsService(db)
    await svc.delete_global_key(provider)


@admin_router.post("/providers/{provider}/test", response_model=dict)
async def test_provider_key(
    provider: str, payload: ProviderKeyInput,
    db: DB, _master: MasterDep,
) -> dict:
    svc = TtsService(db)
    ok = await svc.test_provider_key(provider, payload.api_key)
    return {"ok": ok}


@admin_router.get("/voices", response_model=list[VoiceRead])
async def admin_list_voices(
    db: DB, _master: MasterDep,
) -> list[VoiceRead]:
    svc = TtsService(db)
    voices = await svc.list_voices()
    return [_voice_to_read(v) for v in voices]


@admin_router.patch("/voices/{voice_id}", response_model=VoiceRead)
async def admin_update_voice(
    voice_id: UUID, payload: VoiceUpdate,
    db: DB, _master: MasterDep,
) -> VoiceRead:
    svc = TtsService(db)
    voice = await svc.get_voice(voice_id)
    if voice is None:
        raise HTTPException(status_code=404, detail="Voz não encontrada.")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(voice, k, v)
    await db.flush()
    return _voice_to_read(voice)


@admin_router.post("/voices/{voice_id}/set-default", response_model=VoiceRead)
async def admin_set_default_voice(
    voice_id: UUID, db: DB, _master: MasterDep,
) -> VoiceRead:
    svc = TtsService(db)
    voice = await svc.set_default_voice(voice_id)
    return _voice_to_read(voice)


@admin_router.post("/voices/{voice_id}/preview", response_model=PrepareOutput)
async def admin_preview_voice(
    voice_id: UUID, db: DB, _master: MasterDep,
) -> PrepareOutput:
    """Gera um áudio de amostra pra o admin ouvir a voz antes de escolher.
    Mesma frase sempre — cache reaproveita em cliques subsequentes."""
    svc = TtsService(db)
    sample_text = "Essa voz será usada para realizar as interações com o cidadão."
    voice, audios = await svc.prepare_phrases(voice_id, [sample_text])
    return PrepareOutput(
        voice_external_id=voice.external_id,
        provider=voice.provider,  # type: ignore[arg-type]
        audios=[
            AudioOut(text=a.text, url=a.url, duration_ms=a.duration_ms, from_cache=a.from_cache)
            for a in audios
        ],
    )


# ─── Helper ─────────────────────────────────────────────────────────

def _voice_to_read(v) -> VoiceRead:
    return VoiceRead(
        id=v.id,
        provider=v.provider,
        external_id=v.external_id,
        name=v.name,
        language=v.language,
        gender=v.gender,
        description=v.description,
        sample_url=v.sample_url,
        available_for_selection=v.available_for_selection,
        archived=v.archived,
        display_order=v.display_order,
    )
