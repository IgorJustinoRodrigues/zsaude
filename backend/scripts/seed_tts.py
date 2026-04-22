"""Seed do TTS: credencial ElevenLabs + 6 vozes + Sandro como default.

Uso:
    ELEVENLABS_API_KEY=sk_... uv run python scripts/seed_tts.py

Idempotente — pode rodar várias vezes.
"""

from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import select

# fmt: off
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# fmt: on

from app.core.crypto import encrypt_secret  # noqa: E402
from app.db.session import sessionmaker  # noqa: E402
from app.modules.tts.models import TtsProviderKey, TtsVoice  # noqa: E402


VOICES = [
    {
        "provider": "elevenlabs",
        "external_id": "qPfM2laM0pRL4rrZtBGl",
        "name": "Sandro Dutra",
        "gender": "male",
        "description": "Masculino jovem, agradável — nativo pt-BR.",
        "display_order": 1,
        "is_default": True,
    },
    {
        "provider": "elevenlabs",
        "external_id": "xNGAXaCH8MaasNuo7Hr7",
        "name": "Beto",
        "gender": "male",
        "description": "Masculino jovem, confiante — nativo pt-BR.",
        "display_order": 2,
    },
    {
        "provider": "elevenlabs",
        "external_id": "3Je7qW9yPOhc47iG41pH",
        "name": "Yuri",
        "gender": "male",
        "description": "Masculino jovem, conversacional — nativo pt-BR.",
        "display_order": 3,
    },
    {
        "provider": "elevenlabs",
        "external_id": "lWq4KDY8znfkV0DrK8Vb",
        "name": "Yasmin",
        "gender": "female",
        "description": "Feminina jovem, calma — nativo pt-BR.",
        "display_order": 4,
    },
    {
        "provider": "elevenlabs",
        "external_id": "EXAVITQu4vr4xnSDxMaL",
        "name": "Sarah",
        "gender": "female",
        "description": "Feminina madura, profissional — multilingual (fala pt-BR).",
        "display_order": 5,
    },
    {
        "provider": "elevenlabs",
        "external_id": "XB0fDUnXU5powFXDhCwa",
        "name": "Charlotte",
        "gender": "female",
        "description": "Feminina jovem, suave — multilingual (fala pt-BR).",
        "display_order": 6,
    },
]


async def main() -> None:
    api_key = os.environ.get("ELEVENLABS_API_KEY")

    async with sessionmaker()() as db:
        # ─── Chave global ─────────────────────────────────────
        if api_key:
            existing_key = await db.scalar(
                select(TtsProviderKey)
                .where(TtsProviderKey.provider == "elevenlabs")
                .where(TtsProviderKey.scope_type == "global")
                .limit(1)
            )
            if existing_key:
                existing_key.api_key_encrypted = encrypt_secret(api_key)
                existing_key.active = True
                print("- chave elevenlabs atualizada")
            else:
                db.add(TtsProviderKey(
                    provider="elevenlabs",
                    scope_type="global",
                    scope_id=None,
                    api_key_encrypted=encrypt_secret(api_key),
                    active=True,
                ))
                print("- chave elevenlabs criada")
        else:
            print("- ELEVENLABS_API_KEY não setado; pulando credencial")

        # ─── Vozes ────────────────────────────────────────────
        for v in VOICES:
            existing = await db.scalar(
                select(TtsVoice)
                .where(TtsVoice.provider == v["provider"])
                .where(TtsVoice.external_id == v["external_id"])
                .limit(1)
            )
            is_default = v.pop("is_default", False)
            if existing:
                for k, val in v.items():
                    setattr(existing, k, val)
                existing.language = "pt-BR"
                existing.archived = False
                existing.available_for_selection = True
                if is_default:
                    existing.is_default = True
                print(f"- voz {v['name']} atualizada")
            else:
                voice = TtsVoice(
                    language="pt-BR",
                    archived=False,
                    available_for_selection=True,
                    is_default=is_default,
                    **v,
                )
                db.add(voice)
                print(f"- voz {v['name']} criada{' (default)' if is_default else ''}")

        await db.commit()
        print("\nSeed TTS OK.")


if __name__ == "__main__":
    asyncio.run(main())
