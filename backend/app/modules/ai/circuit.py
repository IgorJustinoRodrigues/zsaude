"""Circuit breaker por provider via Valkey.

Estado armazenado numa key por provider_slug:
  ``ai:circuit:{slug}:state`` = "open" | "closed" (default)
  ``ai:circuit:{slug}:errors`` = contador incrementado em cada falha retriable

Threshold e cooldown vêm das settings. Simples propositalmente — o objetivo
é evitar cascata de timeouts quando um provider cai, não ter sliding windows.
"""

from __future__ import annotations

from app.core.config import settings
from app.core.deps import _valkey_client


def _state_key(slug: str) -> str:
    return f"ai:circuit:{slug}:state"


def _err_key(slug: str) -> str:
    return f"ai:circuit:{slug}:errors"


async def is_open(provider_slug: str) -> bool:
    """True se o breaker está aberto (bloqueando chamadas)."""
    v = await _valkey_client().get(_state_key(provider_slug))
    return v == "open"


async def record_success(provider_slug: str) -> None:
    """Reseta erro counter e fecha breaker se aberto."""
    client = _valkey_client()
    await client.delete(_err_key(provider_slug))
    await client.delete(_state_key(provider_slug))


async def record_error(provider_slug: str) -> None:
    """Incrementa contador. Ao cruzar o threshold, abre o breaker por
    ``AI_CIRCUIT_COOLDOWN_SECONDS`` (TTL na key state)."""
    client = _valkey_client()
    errors = await client.incr(_err_key(provider_slug))
    threshold = getattr(settings, "ai_circuit_open_after_errors", 5)
    if errors >= threshold:
        cooldown = getattr(settings, "ai_circuit_cooldown_seconds", 60)
        await client.set(_state_key(provider_slug), "open", ex=cooldown)
        # contador é zerado quando breaker expira (ex em TTL); mas se o
        # breaker reabrir com mesmo contador, recai imediato — zera aqui pra
        # dar nova chance após cooldown.
        await client.delete(_err_key(provider_slug))
