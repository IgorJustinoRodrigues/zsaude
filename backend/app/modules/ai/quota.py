"""Quotas de consumo de IA via Valkey (sliding counter mensal).

Chaves:
  ``ai:quota:{mun_id}:{YYYYMM}:tokens``    — tokens (in+out) acumulados
  ``ai:quota:{mun_id}:{YYYYMM}:cost``       — custo em centavos acumulado
  ``ai:quota:{mun_id}:{YYYYMM}:requests``   — número de chamadas

TTL: fim do mês + 7 dias (depois o Valkey dropa sozinho).

Fluxo:
1. ANTES da chamada: ``check_quota(db, mun_id)`` — lê os limites do banco
   (tabela ``ai_quotas`` — municipal ou global) e compara com o acumulado
   no Valkey. Se estourou → levanta ``QuotaExceededError``.
2. DEPOIS da chamada: ``record_usage(mun_id, tokens, cost)`` — incrementa
   os contadores no Valkey.

Fail-open: se Valkey estiver indisponível, o sistema continua
funcionando sem aplicar quota (log de warning).
"""

from __future__ import annotations

import calendar
import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import _valkey_client
from app.modules.ai.models import AIQuota, AIQuotaAlert

log = logging.getLogger(__name__)


class QuotaExceededError(Exception):
    """Município atingiu o limite mensal configurado."""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


# ─── Keys Valkey ──────────────────────────────────────────────────────────────


def _month_tag() -> str:
    """Retorna ``YYYYMM`` do mês corrente UTC."""
    now = datetime.now(UTC)
    return f"{now.year:04d}{now.month:02d}"


def _ttl_end_of_month() -> int:
    """Segundos até o fim do mês + 7 dias de folga."""
    now = datetime.now(UTC)
    _, last_day = calendar.monthrange(now.year, now.month)
    end = now.replace(day=last_day, hour=23, minute=59, second=59)
    delta = (end - now).total_seconds() + 7 * 86400
    return max(int(delta), 3600)  # mínimo 1h pra evitar race


def _key(mun_id: UUID | None, metric: str) -> str:
    scope = str(mun_id) if mun_id else "global"
    return f"ai:quota:{scope}:{_month_tag()}:{metric}"


# ─── Leitura dos limites (DB) ────────────────────────────────────────────────


async def _get_limits(db: AsyncSession, mun_id: UUID | None) -> AIQuota | None:
    """Busca quota: municipal → global fallback. None = sem quota."""
    if mun_id is not None:
        row = await db.scalar(
            select(AIQuota).where(
                AIQuota.municipality_id == mun_id,
                AIQuota.active.is_(True),
            )
        )
        if row is not None:
            return row
    # Fallback global.
    return await db.scalar(
        select(AIQuota).where(
            AIQuota.municipality_id.is_(None),
            AIQuota.active.is_(True),
        )
    )


# ─── Check (ANTES da chamada) ────────────────────────────────────────────────


async def check_quota(
    db: AsyncSession,
    municipality_id: UUID | None,
) -> None:
    """Levanta ``QuotaExceededError`` se qualquer limite mensal está estourado.

    Chamado no ``AIService._execute`` antes de chamar o provider. Fail-open
    se Valkey falhar.
    """
    limits = await _get_limits(db, municipality_id)
    if limits is None:
        return  # sem quota configurada → ilimitado

    try:
        client = _valkey_client()
        tokens_s = await client.get(_key(municipality_id, "tokens"))
        cost_s = await client.get(_key(municipality_id, "cost"))
        req_s = await client.get(_key(municipality_id, "requests"))
    except Exception as e:  # noqa: BLE001
        log.warning("ai_quota_valkey_fail", extra={"error": str(e)})
        return  # fail-open

    tokens = int(tokens_s or 0)
    cost = int(cost_s or 0)
    requests = int(req_s or 0)

    if limits.max_tokens > 0 and tokens >= limits.max_tokens:
        raise QuotaExceededError(
            f"Limite mensal de tokens atingido ({tokens:,} de {limits.max_tokens:,})."
        )
    if limits.max_cost_cents > 0 and cost >= limits.max_cost_cents:
        raise QuotaExceededError(
            f"Limite mensal de custo atingido (${cost/100:.2f} de ${limits.max_cost_cents/100:.2f})."
        )
    if limits.max_requests > 0 and requests >= limits.max_requests:
        raise QuotaExceededError(
            f"Limite mensal de chamadas atingido ({requests:,} de {limits.max_requests:,})."
        )


# ─── Record (DEPOIS da chamada) ──────────────────────────────────────────────


async def record_usage(
    municipality_id: UUID | None,
    tokens_in: int,
    tokens_out: int,
    cost_cents: int,
) -> None:
    """Incrementa contadores no Valkey. Chamado após sucesso do provider."""
    try:
        client = _valkey_client()
        ttl = _ttl_end_of_month()
        total_tokens = tokens_in + tokens_out

        pipe = client.pipeline()
        for metric, value in [
            ("tokens", total_tokens),
            ("cost", cost_cents),
            ("requests", 1),
        ]:
            key = _key(municipality_id, metric)
            pipe.incrby(key, value)
            pipe.expire(key, ttl)
        await pipe.execute()
    except Exception as e:  # noqa: BLE001
        log.warning("ai_quota_record_fail", extra={"error": str(e)})


# ─── Alertas (80% / 100%) ────────────────────────────────────────────────────


async def check_and_log_alerts(
    db: AsyncSession,
    municipality_id: UUID | None,
) -> None:
    """Verifica se cruzou 80% ou 100% e registra em ``ai_quota_alerts``.

    Chamado após ``record_usage``. Idempotente por (municipality_id,
    year_month, threshold). Sem notificação — só log + tabela.
    """
    limits = await _get_limits(db, municipality_id)
    if limits is None:
        return

    try:
        client = _valkey_client()
        tokens = int(await client.get(_key(municipality_id, "tokens")) or 0)
        cost = int(await client.get(_key(municipality_id, "cost")) or 0)
        requests = int(await client.get(_key(municipality_id, "requests")) or 0)
    except Exception:  # noqa: BLE001
        return

    year_month = f"{datetime.now(UTC).year:04d}-{datetime.now(UTC).month:02d}"

    for threshold in (80, 100):
        exceeded = False
        if limits.max_tokens > 0 and tokens >= limits.max_tokens * threshold / 100:
            exceeded = True
        if limits.max_cost_cents > 0 and cost >= limits.max_cost_cents * threshold / 100:
            exceeded = True
        if limits.max_requests > 0 and requests >= limits.max_requests * threshold / 100:
            exceeded = True

        if not exceeded:
            continue

        # Já alertou neste mês pra este threshold?
        existing = await db.scalar(
            select(AIQuotaAlert).where(
                AIQuotaAlert.municipality_id == municipality_id if municipality_id else AIQuotaAlert.municipality_id.is_(None),
                AIQuotaAlert.year_month == year_month,
                AIQuotaAlert.threshold == threshold,
            )
        )
        if existing:
            continue

        alert = AIQuotaAlert(
            municipality_id=municipality_id,
            year_month=year_month,
            threshold=threshold,
        )
        db.add(alert)
        log.warning(
            "ai_quota_alert",
            extra={
                "municipality_id": str(municipality_id) if municipality_id else "global",
                "threshold": threshold,
                "tokens": tokens,
                "cost_cents": cost,
                "requests": requests,
            },
        )

    await db.flush()
