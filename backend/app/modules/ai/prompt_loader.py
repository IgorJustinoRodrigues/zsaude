"""Carrega prompt templates do banco com cache in-memory e fallback.

Fluxo:
1. Checa cache em memória (TTL de 60s — ajustável).
2. Se miss, busca no banco (``ai_prompt_templates`` por slug + version ativa).
3. Se não achar no banco, retorna ``None`` — caller usa hardcoded.

Nunca levanta exceção — logs de warning e segue.
"""

from __future__ import annotations

import logging
import time

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.models import AIPromptTemplate

log = logging.getLogger(__name__)

_CACHE_TTL = 60  # segundos
_cache: dict[str, tuple[str, float]] = {}  # key="slug:version" → (body, expires_at)


async def load_prompt(
    db: AsyncSession,
    slug: str,
    version: int,
    *,
    fallback: str | None = None,
) -> str | None:
    """Retorna o ``body`` do prompt. Cache por 60s. Fallback se não achar."""
    key = f"{slug}:{version}"
    now = time.monotonic()

    # Cache hit?
    cached = _cache.get(key)
    if cached and cached[1] > now:
        return cached[0]

    # DB lookup.
    try:
        row = await db.scalar(
            select(AIPromptTemplate.body).where(
                and_(
                    AIPromptTemplate.slug == slug,
                    AIPromptTemplate.version == version,
                    AIPromptTemplate.active.is_(True),
                )
            )
        )
    except Exception as e:  # noqa: BLE001
        log.warning("prompt_load_failed", extra={"slug": slug, "version": version, "error": str(e)})
        return fallback

    if row is not None:
        _cache[key] = (row, now + _CACHE_TTL)
        return row

    return fallback


def invalidate_cache(slug: str | None = None) -> None:
    """Limpa cache. Sem slug → limpa tudo."""
    if slug is None:
        _cache.clear()
    else:
        to_remove = [k for k in _cache if k.startswith(f"{slug}:")]
        for k in to_remove:
            del _cache[k]
