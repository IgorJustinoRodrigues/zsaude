"""Endpoints do Gateway de IA.

Divisão:
- ``/ai/operations/*`` — consumo por módulos (requer ctx + ``ai.operations.use``)
- ``/sys/ai/*`` — administração **centralizada** pela plataforma (MASTER).
  O SYS gerencia catálogo (providers/models/prompts), rotas, chaves e quotas.
  Escopo: ``municipality_id`` ausente ou NULL = global (fallback padrão pra
  todos os municípios). ``municipality_id`` preenchido = personalização.

OPS não tem tela de IA — decisão arquitetural pra manter gestão centralizada.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, delete, func, select
from sqlalchemy.exc import IntegrityError

from app.core.crypto import decrypt_secret, encrypt_secret, fingerprint_secret, last4
from app.core.deps import DB, WorkContext, require_master, requires
from app.modules.ai.models import (
    AICapabilityRoute,
    AIModel,
    AIMunicipalityKey,
    AIPromptTemplate,
    AIProvider,
    AIQuota,
    AIRouteScope,
    AISdkKind,
    AIUsageLog,
)
from app.modules.ai.operations import get_operation, list_operations
from app.modules.ai.providers import get_provider
from app.modules.ai.providers.base import (
    ChatMessage,
    ChatRequest,
    ProviderCredentials,
    ProviderError,
)
from app.modules.ai.schemas import (
    AICapabilityRouteRead,
    AICapabilityRouteWrite,
    AIKeyTestRequest,
    AIKeyTestResponse,
    AIModelRead,
    AIModelWrite,
    AIMunicipalityKeyRead,
    AIMunicipalityKeyWrite,
    AIOperationRequest,
    AIOperationResponse,
    AIProviderRead,
    AIProviderWrite,
    AIPromptTemplateRead,
    AIPromptTemplateWrite,
    AIQuotaRead,
    AIQuotaWrite,
    AIUsageListResponse,
    AIUsageLogRead,
    AIUsageMeta,
    AIUsageSummary,
)
from app.modules.ai.service import AIService, AIServiceError


# ─── /ai/operations/* (consumo) ───────────────────────────────────────────────


operations_router = APIRouter(prefix="/ai/operations", tags=["ai"])


@operations_router.post("/{slug}", response_model=AIOperationResponse)
async def run_operation(
    slug: str,
    payload: AIOperationRequest,
    db: DB,
    ctx: WorkContext = requires(permission="ai.operations.use"),
) -> AIOperationResponse:
    try:
        op_cls = get_operation(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Operation '{slug}' não existe.") from None

    service = AIService(db, ctx)
    try:
        output_dto, usage = await op_cls.run(
            service,
            payload.inputs,
            module_code=payload.module_code,
            idempotency_key=payload.idempotency_key,
        )
    except AIServiceError as e:
        status = 429 if e.code == "quota_exceeded" else 503
        raise HTTPException(status_code=status, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    last_log = await db.scalar(
        select(AIUsageLog)
        .where(AIUsageLog.operation_slug == slug, AIUsageLog.user_id == ctx.user_id)
        .order_by(AIUsageLog.at.desc())
        .limit(1)
    )
    meta = AIUsageMeta(
        operation_slug=slug,
        provider_slug=last_log.provider_slug if last_log else "",
        model_slug=last_log.model_slug if last_log else "",
        tokens_in=last_log.tokens_in if last_log else usage.get("tokens_in", 0),
        tokens_out=last_log.tokens_out if last_log else usage.get("tokens_out", 0),
        total_cost_cents=last_log.total_cost_cents if last_log else 0,
        latency_ms=last_log.latency_ms if last_log else usage.get("latency_ms", 0),
    )

    return AIOperationResponse(
        output=output_dto.model_dump(mode="json", by_alias=True),
        usage=meta,
    )


@operations_router.get("/", response_model=list[dict[str, Any]])
async def list_available_operations(
    _ctx: WorkContext = requires(permission="ai.operations.use"),
) -> list[dict[str, Any]]:
    """Lista operations registradas (pra autocomplete/UI)."""
    out = []
    for op in list_operations():
        out.append({
            "slug": op.slug,
            "capability": op.capability,
            "prompt_slug": op.prompt_slug,
            "prompt_version": op.prompt_version,
            "input_schema": op.input_model.model_json_schema(),
            "output_schema": op.output_model.model_json_schema(),
        })
    return out


# ─── /sys/ai/* (admin centralizado — MASTER) ──────────────────────────────────


sys_router = APIRouter(
    prefix="/sys/ai", tags=["ai-sys"], dependencies=[Depends(require_master)],
)


# ── Catálogo: Providers ─────────────────────────────────────────────────────


@sys_router.get("/providers", response_model=list[AIProviderRead])
async def sys_list_providers(db: DB) -> list[AIProviderRead]:
    rows = await db.execute(select(AIProvider).order_by(AIProvider.slug))
    return [AIProviderRead.model_validate(r, from_attributes=True) for r in rows.scalars().all()]


@sys_router.post("/providers", response_model=AIProviderRead, status_code=201)
async def sys_create_provider(payload: AIProviderWrite, db: DB) -> AIProviderRead:
    entry = AIProvider(
        slug=payload.slug,
        display_name=payload.display_name,
        sdk_kind=AISdkKind(payload.sdk_kind),
        base_url_default=payload.base_url_default,
        capabilities=payload.capabilities,
        active=payload.active,
    )
    db.add(entry)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail="Slug já existe.") from e
    return AIProviderRead.model_validate(entry, from_attributes=True)


@sys_router.put("/providers/{provider_id}", response_model=AIProviderRead)
async def sys_update_provider(provider_id: UUID, payload: AIProviderWrite, db: DB) -> AIProviderRead:
    row = await db.scalar(select(AIProvider).where(AIProvider.id == provider_id))
    if not row:
        raise HTTPException(status_code=404, detail="Provider não encontrado.") from None
    row.slug = payload.slug
    row.display_name = payload.display_name
    row.sdk_kind = AISdkKind(payload.sdk_kind)
    row.base_url_default = payload.base_url_default
    row.capabilities = payload.capabilities
    row.active = payload.active
    return AIProviderRead.model_validate(row, from_attributes=True)


@sys_router.delete("/providers/{provider_id}", status_code=204)
async def sys_delete_provider(provider_id: UUID, db: DB) -> None:
    await db.execute(delete(AIProvider).where(AIProvider.id == provider_id))


# ── Catálogo: Modelos ───────────────────────────────────────────────────────


@sys_router.get("/models", response_model=list[AIModelRead])
async def sys_list_models(
    db: DB, provider_id: UUID | None = None,
) -> list[AIModelRead]:
    stmt = select(AIModel, AIProvider).join(AIProvider, AIProvider.id == AIModel.provider_id)
    if provider_id:
        stmt = stmt.where(AIModel.provider_id == provider_id)
    rows = await db.execute(stmt.order_by(AIModel.slug))
    return [_model_to_read(m, p) for m, p in rows.all()]


@sys_router.post("/models", response_model=AIModelRead, status_code=201)
async def sys_create_model(payload: AIModelWrite, db: DB) -> AIModelRead:
    provider = await db.scalar(select(AIProvider).where(AIProvider.id == payload.provider_id))
    if not provider:
        raise HTTPException(status_code=404, detail="Provider não encontrado.") from None
    entry = AIModel(
        provider_id=payload.provider_id,
        slug=payload.slug,
        display_name=payload.display_name,
        capabilities=payload.capabilities,
        input_cost_per_mtok=payload.input_cost_per_mtok,
        output_cost_per_mtok=payload.output_cost_per_mtok,
        max_context=payload.max_context,
        active=payload.active,
    )
    db.add(entry)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail="Modelo (provider,slug) já existe.") from e
    return _model_to_read(entry, provider)


@sys_router.put("/models/{model_id}", response_model=AIModelRead)
async def sys_update_model(model_id: UUID, payload: AIModelWrite, db: DB) -> AIModelRead:
    row = await db.scalar(select(AIModel).where(AIModel.id == model_id))
    if not row:
        raise HTTPException(status_code=404, detail="Modelo não encontrado.") from None
    row.provider_id = payload.provider_id
    row.slug = payload.slug
    row.display_name = payload.display_name
    row.capabilities = payload.capabilities
    row.input_cost_per_mtok = payload.input_cost_per_mtok
    row.output_cost_per_mtok = payload.output_cost_per_mtok
    row.max_context = payload.max_context
    row.active = payload.active
    provider = await db.scalar(select(AIProvider).where(AIProvider.id == row.provider_id))
    return _model_to_read(row, provider)


@sys_router.delete("/models/{model_id}", status_code=204)
async def sys_delete_model(model_id: UUID, db: DB) -> None:
    await db.execute(delete(AIModel).where(AIModel.id == model_id))


# ── Rotas (global + municipal + módulo) ─────────────────────────────────────


@sys_router.get("/routes", response_model=list[AICapabilityRouteRead])
async def sys_list_routes(
    db: DB,
    municipality_id: UUID | None = None,
) -> list[AICapabilityRouteRead]:
    """Lista rotas. Sem ``municipality_id`` → globais. Com → daquele município."""
    stmt = (
        select(AICapabilityRoute, AIModel, AIProvider)
        .join(AIModel, AIModel.id == AICapabilityRoute.model_id)
        .join(AIProvider, AIProvider.id == AIModel.provider_id)
    )
    if municipality_id is None:
        stmt = stmt.where(AICapabilityRoute.scope == AIRouteScope.global_)
    else:
        stmt = stmt.where(
            AICapabilityRoute.scope.in_([AIRouteScope.municipality, AIRouteScope.module]),
            AICapabilityRoute.municipality_id == municipality_id,
        )
    rows = await db.execute(
        stmt.order_by(AICapabilityRoute.capability, AICapabilityRoute.priority)
    )
    return [_route_to_read(r, m, p) for r, m, p in rows.all()]


@sys_router.put("/routes", response_model=AICapabilityRouteRead)
async def sys_upsert_route(payload: AICapabilityRouteWrite, db: DB) -> AICapabilityRouteRead:
    model = await db.scalar(select(AIModel).where(AIModel.id == payload.model_id))
    if not model:
        raise HTTPException(status_code=404, detail="Modelo não encontrado.") from None
    provider = await db.scalar(select(AIProvider).where(AIProvider.id == model.provider_id))

    scope = AIRouteScope(payload.scope)
    mun_id = payload.municipality_id
    module_code = payload.module_code

    # Sanitiza campos conforme scope (defensivo: contract do CHECK no banco).
    if scope == AIRouteScope.global_:
        mun_id, module_code = None, None
    elif scope == AIRouteScope.municipality:
        if mun_id is None:
            raise HTTPException(status_code=422, detail="Escopo municipality exige municipality_id.")
        module_code = None
    elif scope == AIRouteScope.module:
        if mun_id is None or not module_code:
            raise HTTPException(status_code=422, detail="Escopo module exige municipality_id + module_code.")

    existing = await db.scalar(
        select(AICapabilityRoute).where(
            AICapabilityRoute.scope == scope,
            AICapabilityRoute.municipality_id.is_(mun_id) if mun_id is None else AICapabilityRoute.municipality_id == mun_id,
            AICapabilityRoute.module_code.is_(module_code) if module_code is None else AICapabilityRoute.module_code == module_code,
            AICapabilityRoute.capability == payload.capability,
            AICapabilityRoute.priority == payload.priority,
        )
    )
    if existing is None:
        entry = AICapabilityRoute(
            scope=scope,
            municipality_id=mun_id,
            module_code=module_code,
            capability=payload.capability,
            model_id=payload.model_id,
            priority=payload.priority,
            active=payload.active,
        )
        db.add(entry)
        await db.flush()
    else:
        existing.model_id = payload.model_id
        existing.active = payload.active
        entry = existing
    return _route_to_read(entry, model, provider)


@sys_router.delete("/routes/{route_id}", status_code=204)
async def sys_delete_route(route_id: UUID, db: DB) -> None:
    await db.execute(delete(AICapabilityRoute).where(AICapabilityRoute.id == route_id))


# ── Chaves (global ou por município) ────────────────────────────────────────


@sys_router.get("/keys", response_model=list[AIMunicipalityKeyRead])
async def sys_list_keys(
    db: DB, municipality_id: UUID | None = None,
) -> list[AIMunicipalityKeyRead]:
    """Lista chaves. Sem ``municipality_id`` → chaves globais (padrão)."""
    stmt = select(AIMunicipalityKey, AIProvider).join(
        AIProvider, AIProvider.id == AIMunicipalityKey.provider_id,
    )
    if municipality_id is None:
        stmt = stmt.where(AIMunicipalityKey.municipality_id.is_(None))
    else:
        stmt = stmt.where(AIMunicipalityKey.municipality_id == municipality_id)
    rows = await db.execute(stmt)
    return [_key_to_read(k, p) for k, p in rows.all()]


@sys_router.put("/keys", response_model=AIMunicipalityKeyRead)
async def sys_upsert_key(
    payload: AIMunicipalityKeyWrite,
    db: DB,
    municipality_id: UUID | None = None,
) -> AIMunicipalityKeyRead:
    provider = await db.scalar(select(AIProvider).where(AIProvider.id == payload.provider_id))
    if not provider:
        raise HTTPException(status_code=404, detail="Provider não encontrado.") from None

    # mun_id segue o query param explicitamente — `None` = chave global.
    cond = (
        AIMunicipalityKey.municipality_id.is_(None)
        if municipality_id is None
        else AIMunicipalityKey.municipality_id == municipality_id
    )
    existing = await db.scalar(
        select(AIMunicipalityKey).where(
            cond, AIMunicipalityKey.provider_id == payload.provider_id,
        )
    )

    if existing is None:
        if not payload.api_key:
            raise HTTPException(
                status_code=422, detail="Chave é obrigatória no primeiro cadastro.",
            )
        entry = AIMunicipalityKey(
            municipality_id=municipality_id,
            provider_id=payload.provider_id,
            encrypted_api_key=encrypt_secret(payload.api_key) or "",
            base_url_override=payload.base_url_override,
            key_fingerprint=fingerprint_secret(payload.api_key),
            key_last4=last4(payload.api_key),
            active=payload.active,
        )
        db.add(entry)
        await db.flush()
    else:
        if payload.api_key:
            existing.encrypted_api_key = encrypt_secret(payload.api_key) or ""
            existing.key_fingerprint = fingerprint_secret(payload.api_key)
            existing.key_last4 = last4(payload.api_key)
            existing.rotated_at = datetime.now(UTC)
        existing.base_url_override = payload.base_url_override
        existing.active = payload.active
        entry = existing

    return _key_to_read(entry, provider)


@sys_router.delete("/keys/{provider_id}", status_code=204)
async def sys_delete_key(
    provider_id: UUID, db: DB, municipality_id: UUID | None = None,
) -> None:
    cond = (
        AIMunicipalityKey.municipality_id.is_(None)
        if municipality_id is None
        else AIMunicipalityKey.municipality_id == municipality_id
    )
    await db.execute(
        delete(AIMunicipalityKey).where(cond, AIMunicipalityKey.provider_id == provider_id)
    )


@sys_router.post("/keys/test", response_model=AIKeyTestResponse)
async def sys_test_key(
    payload: AIKeyTestRequest,
    db: DB,
    municipality_id: UUID | None = None,
) -> AIKeyTestResponse:
    """Dispara uma chamada mínima pra validar a chave (global ou municipal)."""
    cond = (
        AIMunicipalityKey.municipality_id.is_(None)
        if municipality_id is None
        else AIMunicipalityKey.municipality_id == municipality_id
    )
    row = await db.scalar(
        select(AIMunicipalityKey).where(
            cond, AIMunicipalityKey.provider_id == payload.provider_id,
        )
    )
    provider = await db.scalar(select(AIProvider).where(AIProvider.id == payload.provider_id))
    if not row or not provider:
        return AIKeyTestResponse(ok=False, detail="Chave não configurada.")

    cheapest = await db.scalar(
        select(AIModel)
        .where(
            AIModel.provider_id == payload.provider_id,
            AIModel.active.is_(True),
            AIModel.capabilities.any("chat"),  # type: ignore[attr-defined]
        )
        .order_by(AIModel.input_cost_per_mtok.asc())
        .limit(1)
    )
    if not cheapest:
        return AIKeyTestResponse(ok=False, detail="Nenhum modelo 'chat' no catálogo.")

    impl = get_provider(provider.sdk_kind)
    creds = ProviderCredentials(
        api_key=decrypt_secret(row.encrypted_api_key),
        base_url=row.base_url_override or provider.base_url_default or "",
    )
    try:
        await impl.chat(
            ChatRequest(
                messages=[ChatMessage(role="user", content="ping")],
                max_tokens=5, temperature=0.0,
            ),
            model=cheapest.slug,
            creds=creds,
        )
        return AIKeyTestResponse(ok=True, detail=f"OK com {cheapest.slug}.")
    except ProviderError as e:
        return AIKeyTestResponse(ok=False, detail=str(e))


# ── Quotas (global ou por município) ────────────────────────────────────────


@sys_router.get("/quotas", response_model=list[AIQuotaRead])
async def sys_list_quotas(
    db: DB, municipality_id: UUID | None = None,
) -> list[AIQuotaRead]:
    """Lista quotas. Sem ``municipality_id`` → quotas globais."""
    stmt = select(AIQuota)
    if municipality_id is None:
        stmt = stmt.where(AIQuota.municipality_id.is_(None))
    else:
        stmt = stmt.where(AIQuota.municipality_id == municipality_id)
    rows = await db.execute(stmt)
    return [AIQuotaRead.model_validate(r, from_attributes=True) for r in rows.scalars().all()]


@sys_router.put("/quotas", response_model=AIQuotaRead)
async def sys_upsert_quota(
    payload: AIQuotaWrite,
    db: DB,
    municipality_id: UUID | None = None,
) -> AIQuotaRead:
    cond = (
        AIQuota.municipality_id.is_(None)
        if municipality_id is None
        else AIQuota.municipality_id == municipality_id
    )
    row = await db.scalar(select(AIQuota).where(cond))
    if row is None:
        row = AIQuota(
            municipality_id=municipality_id,
            period="month",
            max_tokens=payload.max_tokens,
            max_cost_cents=payload.max_cost_cents,
            max_requests=payload.max_requests,
            max_per_user_tokens=payload.max_per_user_tokens,
            active=payload.active,
        )
        db.add(row)
        await db.flush()
    else:
        row.max_tokens = payload.max_tokens
        row.max_cost_cents = payload.max_cost_cents
        row.max_requests = payload.max_requests
        row.max_per_user_tokens = payload.max_per_user_tokens
        row.active = payload.active

    return AIQuotaRead.model_validate(row, from_attributes=True)


@sys_router.delete("/quotas", status_code=204)
async def sys_delete_quota(
    db: DB, municipality_id: UUID | None = None,
) -> None:
    """Remove a quota — global (sem mun_id) ou daquele município."""
    cond = (
        AIQuota.municipality_id.is_(None)
        if municipality_id is None
        else AIQuota.municipality_id == municipality_id
    )
    await db.execute(delete(AIQuota).where(cond))


# ── Prompts ─────────────────────────────────────────────────────────────────


@sys_router.get("/prompts", response_model=list[AIPromptTemplateRead])
async def sys_list_prompts(db: DB) -> list[AIPromptTemplateRead]:
    rows = await db.execute(
        select(AIPromptTemplate).order_by(AIPromptTemplate.slug, AIPromptTemplate.version.desc())
    )
    return [AIPromptTemplateRead.model_validate(r, from_attributes=True) for r in rows.scalars().all()]


@sys_router.post("/prompts", response_model=AIPromptTemplateRead, status_code=201)
async def sys_create_prompt(payload: AIPromptTemplateWrite, db: DB) -> AIPromptTemplateRead:
    entry = AIPromptTemplate(**payload.model_dump())
    db.add(entry)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail="(slug,version) já existe.") from e
    return AIPromptTemplateRead.model_validate(entry, from_attributes=True)


@sys_router.put("/prompts/{prompt_id}", response_model=AIPromptTemplateRead)
async def sys_update_prompt(
    prompt_id: UUID, payload: AIPromptTemplateWrite, db: DB,
) -> AIPromptTemplateRead:
    row = await db.scalar(select(AIPromptTemplate).where(AIPromptTemplate.id == prompt_id))
    if not row:
        raise HTTPException(status_code=404, detail="Prompt não encontrado.") from None
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    return AIPromptTemplateRead.model_validate(row, from_attributes=True)


@sys_router.delete("/prompts/{prompt_id}", status_code=204)
async def sys_delete_prompt(prompt_id: UUID, db: DB) -> None:
    await db.execute(delete(AIPromptTemplate).where(AIPromptTemplate.id == prompt_id))


# ── Consumo ─────────────────────────────────────────────────────────────────


@sys_router.get("/usage", response_model=AIUsageListResponse)
async def sys_list_usage(
    db: DB,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    municipality_id: UUID | None = None,
    capability: str | None = None,
    module_code: str | None = None,
    operation_slug: str | None = None,
    success: bool | None = None,
    user_id: UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> AIUsageListResponse:
    conds = []
    if municipality_id is not None:
        conds.append(AIUsageLog.municipality_id == municipality_id)
    if from_:
        conds.append(AIUsageLog.at >= from_)
    if to:
        conds.append(AIUsageLog.at <= to)
    if capability:
        conds.append(AIUsageLog.capability == capability)
    if module_code:
        conds.append(AIUsageLog.module_code == module_code)
    if operation_slug:
        conds.append(AIUsageLog.operation_slug == operation_slug)
    if success is not None:
        conds.append(AIUsageLog.success.is_(success))
    if user_id:
        conds.append(AIUsageLog.user_id == user_id)

    total = await db.scalar(select(func.count()).select_from(AIUsageLog).where(*conds))
    rows = await db.execute(
        select(AIUsageLog)
        .where(*conds)
        .order_by(AIUsageLog.at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return AIUsageListResponse(
        items=[AIUsageLogRead.model_validate(r, from_attributes=True) for r in rows.scalars().all()],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )


@sys_router.get("/usage/summary", response_model=AIUsageSummary)
async def sys_usage_summary(
    db: DB,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    municipality_id: UUID | None = None,
) -> AIUsageSummary:
    conds = []
    if municipality_id is not None:
        conds.append(AIUsageLog.municipality_id == municipality_id)
    if from_:
        conds.append(AIUsageLog.at >= from_)
    if to:
        conds.append(AIUsageLog.at <= to)

    row = await db.execute(
        select(
            func.count().label("requests"),
            func.coalesce(func.sum(AIUsageLog.tokens_in), 0).label("tok_in"),
            func.coalesce(func.sum(AIUsageLog.tokens_out), 0).label("tok_out"),
            func.coalesce(func.sum(AIUsageLog.total_cost_cents), 0).label("cost"),
        ).where(*conds)
    )
    r = row.one()
    ok_count = await db.scalar(
        select(func.count()).select_from(AIUsageLog).where(*conds, AIUsageLog.success.is_(True))
    ) or 0
    return AIUsageSummary(
        requests=int(r.requests or 0),
        tokens_in=int(r.tok_in or 0),
        tokens_out=int(r.tok_out or 0),
        total_cost_cents=int(r.cost or 0),
        success_count=int(ok_count),
        failure_count=int((r.requests or 0) - ok_count),
    )


# ─── helpers ──────────────────────────────────────────────────────────────────


@sys_router.get("/usage/timeseries")
async def sys_usage_timeseries(
    db: DB,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    municipality_id: UUID | None = None,
    group: str = Query(default="day", pattern="^(day|week)$"),
) -> list[dict]:
    """Retorna séries temporais de consumo agrupadas por dia ou semana.

    Cada item: ``{date, requests, tokensIn, tokensOut, totalCostCents, successes, failures}``.
    """
    trunc_fn = func.date_trunc(group, AIUsageLog.at)
    conds = []
    if municipality_id is not None:
        conds.append(AIUsageLog.municipality_id == municipality_id)
    if from_:
        conds.append(AIUsageLog.at >= from_)
    if to:
        conds.append(AIUsageLog.at <= to)

    stmt = (
        select(
            trunc_fn.label("bucket"),
            func.count().label("requests"),
            func.coalesce(func.sum(AIUsageLog.tokens_in), 0).label("tokens_in"),
            func.coalesce(func.sum(AIUsageLog.tokens_out), 0).label("tokens_out"),
            func.coalesce(func.sum(AIUsageLog.total_cost_cents), 0).label("total_cost_cents"),
            func.count().filter(AIUsageLog.success.is_(True)).label("successes"),
            func.count().filter(AIUsageLog.success.is_(False)).label("failures"),
        )
        .where(*conds)
        .group_by("bucket")
        .order_by("bucket")
    )
    rows = await db.execute(stmt)
    return [
        {
            "date": r.bucket.isoformat() if r.bucket else "",
            "requests": int(r.requests or 0),
            "tokensIn": int(r.tokens_in or 0),
            "tokensOut": int(r.tokens_out or 0),
            "totalCostCents": int(r.total_cost_cents or 0),
            "successes": int(r.successes or 0),
            "failures": int(r.failures or 0),
        }
        for r in rows.all()
    ]


@sys_router.get("/usage/top-operations")
async def sys_top_operations(
    db: DB,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    municipality_id: UUID | None = None,
    limit: int = Query(default=5, ge=1, le=20),
) -> list[dict]:
    """Top operations por número de chamadas."""
    conds = []
    if municipality_id is not None:
        conds.append(AIUsageLog.municipality_id == municipality_id)
    if from_:
        conds.append(AIUsageLog.at >= from_)
    if to:
        conds.append(AIUsageLog.at <= to)

    stmt = (
        select(
            AIUsageLog.operation_slug,
            func.count().label("requests"),
            func.coalesce(func.sum(AIUsageLog.total_cost_cents), 0).label("cost"),
            func.coalesce(func.sum(AIUsageLog.tokens_in + AIUsageLog.tokens_out), 0).label("tokens"),
        )
        .where(*conds)
        .group_by(AIUsageLog.operation_slug)
        .order_by(func.count().desc())
        .limit(limit)
    )
    rows = await db.execute(stmt)
    return [
        {
            "operationSlug": r.operation_slug,
            "requests": int(r.requests or 0),
            "totalCostCents": int(r.cost or 0),
            "totalTokens": int(r.tokens or 0),
        }
        for r in rows.all()
    ]


def _route_to_read(
    r: AICapabilityRoute, m: AIModel, p: AIProvider,
) -> AICapabilityRouteRead:
    return AICapabilityRouteRead(
        id=r.id,
        scope=r.scope.value,
        municipality_id=r.municipality_id,
        module_code=r.module_code,
        capability=r.capability,
        model_id=r.model_id,
        model_slug=m.slug,
        provider_slug=p.slug,
        priority=r.priority,
        active=r.active,
    )


def _model_to_read(m: AIModel, p: AIProvider | None) -> AIModelRead:
    return AIModelRead(
        id=m.id, provider_id=m.provider_id,
        provider_slug=p.slug if p else "",
        slug=m.slug, display_name=m.display_name,
        capabilities=list(m.capabilities or []),
        input_cost_per_mtok=m.input_cost_per_mtok,
        output_cost_per_mtok=m.output_cost_per_mtok,
        max_context=m.max_context, active=m.active,
    )


def _key_to_read(k: AIMunicipalityKey, p: AIProvider) -> AIMunicipalityKeyRead:
    return AIMunicipalityKeyRead(
        id=k.id,
        provider_id=k.provider_id,
        provider_slug=p.slug,
        configured=bool(k.encrypted_api_key),
        key_fingerprint=k.key_fingerprint,
        key_last4=k.key_last4,
        base_url_override=k.base_url_override,
        rotated_at=k.rotated_at,
        active=k.active,
    )


# mantido pra uso no api/v1.py
__all__ = ["operations_router", "sys_router"]
