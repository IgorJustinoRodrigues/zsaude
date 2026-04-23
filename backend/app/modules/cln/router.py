"""Endpoints do módulo Clínico.

- ``GET  /cln/ping`` — sanity.
- ``GET  /cln/config/effective`` — config efetiva resolvida.
- ``GET  /cln/triagem`` — fila de triagem (se habilitada no escopo).
- ``GET  /cln/atendimento`` — fila de atendimento.
- ``POST /cln/tickets/{id}/call`` — chama o paciente.
- ``POST /cln/tickets/{id}/start`` — inicia o atendimento.
- ``POST /cln/tickets/{id}/release`` — triagem → atendimento.
- ``POST /cln/tickets/{id}/finish`` — encerra o atendimento (terminal).
- ``POST /cln/tickets/{id}/cancel`` — cancela com motivo.

Admin (MASTER):
- ``GET/PATCH/DELETE /admin/cln/config/municipalities/{id}``
- ``GET/PATCH/DELETE /admin/cln/config/facilities/{id}``
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query

from app.core.deps import (
    DB, CurrentContextDep, CurrentUserDep, MasterDep, TenantDB, Valkey,
    WorkContext, current_context, requires,
)
from sqlalchemy import select as _select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cln.schemas import (
    CancelInput,
    ClnConfigRead,
    ClnConfigUpdate,
    ClnQueueItem,
    EffectiveClnConfig,
)
from app.modules.cln.service import ClnConfigService, ClnService
from app.modules.tenants.models import Facility
from app.modules.users.models import User

router = APIRouter(prefix="/cln", tags=["cln"])
admin_router = APIRouter(prefix="/admin/cln", tags=["cln-admin"])


# ─── Sanity ───────────────────────────────────────────────────────────

@router.get("/ping")
async def ping(ctx: CurrentContextDep) -> dict[str, str]:
    return {
        "module": "cln",
        "municipality_ibge": ctx.municipality_ibge,
        "facility_id": str(ctx.facility_id),
    }


# ─── Admin: config por município ──────────────────────────────────────

@admin_router.get(
    "/config/municipalities/{municipality_id}",
    response_model=ClnConfigRead,
)
async def get_municipality_cln_config(
    municipality_id: UUID, db: DB, _: MasterDep,
) -> ClnConfigRead:
    return await ClnConfigService(db).get_for_municipality(municipality_id)


@admin_router.patch(
    "/config/municipalities/{municipality_id}",
    response_model=ClnConfigRead,
)
async def update_municipality_cln_config(
    municipality_id: UUID, payload: ClnConfigUpdate, db: DB, _: MasterDep,
) -> ClnConfigRead:
    return await ClnConfigService(db).update_for_municipality(municipality_id, payload)


# ─── Admin: config por unidade ────────────────────────────────────────

@admin_router.get(
    "/config/facilities/{facility_id}",
    response_model=ClnConfigRead,
)
async def get_facility_cln_config(
    facility_id: UUID, db: DB, _: MasterDep,
) -> ClnConfigRead:
    return await ClnConfigService(db).get_for_facility(facility_id)


@admin_router.patch(
    "/config/facilities/{facility_id}",
    response_model=ClnConfigRead,
)
async def update_facility_cln_config(
    facility_id: UUID, payload: ClnConfigUpdate, db: DB, _: MasterDep,
) -> ClnConfigRead:
    return await ClnConfigService(db).update_for_facility(facility_id, payload)


# ─── Runtime: efetiva ─────────────────────────────────────────────────

@router.get("/config/effective", response_model=EffectiveClnConfig)
async def effective_cln_config(
    db: DB,
    valkey: Valkey,
    user: CurrentUserDep,
    facility_id: Annotated[UUID | None, Query(alias="facilityId")] = None,
    municipality_id: Annotated[UUID | None, Query(alias="municipalityId")] = None,
    x_work_context: Annotated[str | None, Header(alias="X-Work-Context")] = None,
) -> EffectiveClnConfig:
    """Config efetiva. Três modos:

    1. ``?facilityId=...`` — MASTER/admin resolve pra unidade específica.
    2. ``?municipalityId=...`` — MASTER/admin resolve pro município.
    3. Sem params, com header ``X-Work-Context`` — runtime do próprio usuário.
    """
    svc = ClnConfigService(db)

    if facility_id is not None:
        fac = await db.get(Facility, facility_id)
        if fac is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        return await svc.effective_for_facility(facility_id, fac.municipality_id)
    if municipality_id is not None:
        return await svc.effective_for_municipality(municipality_id)

    # Sem params → precisa do work-context. Resolve aqui manualmente
    # pra não obrigar MASTER a ter contexto quando ele passou param.
    if not x_work_context:
        raise HTTPException(
            status_code=400,
            detail="Informe facilityId ou municipalityId, ou envie o header X-Work-Context.",
        )
    ctx: WorkContext = await current_context(
        db=db, valkey=valkey, user=user, x_work_context=x_work_context,
    )
    if ctx.facility_id and ctx.municipality_id:
        return await svc.effective_for_facility(ctx.facility_id, ctx.municipality_id)
    if ctx.municipality_id:
        return await svc.effective_for_municipality(ctx.municipality_id)
    raise HTTPException(status_code=400, detail="Contexto inválido.")


# ─── Filas ────────────────────────────────────────────────────────────

def _att_to_queue_item(att, started_by_name: str | None = None) -> ClnQueueItem:
    return ClnQueueItem(
        id=att.id,
        facility_id=att.facility_id,
        ticket_number=att.ticket_number,
        priority=att.priority,
        patient_id=att.patient_id,
        patient_name=att.patient_name,
        status=att.status,
        sector_name=att.sector_name,
        arrived_at=att.arrived_at,
        called_at=att.called_at,
        started_at=att.started_at,
        started_by_user_id=att.started_by_user_id,
        started_by_user_name=started_by_name,
    )


async def _resolve_user_names(
    app_db: AsyncSession, user_ids: list[UUID],
) -> dict[UUID, str]:
    """Busca nomes dos usuários em bulk — evita N+1 na listagem.
    Retorna map ``id → name`` (só pra usuários encontrados)."""
    if not user_ids:
        return {}
    rows = await app_db.scalars(
        _select(User).where(User.id.in_(set(user_ids)))
    )
    return {u.id: (u.social_name.strip() or u.name) for u in rows.all()}


@router.get("/tickets/{att_id}", response_model=ClnQueueItem)
async def get_ticket(
    att_id: UUID, db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    """Retorna um ticket específico do CLN (pra tela de atendimento/triagem).
    Valida que pertence à unidade do usuário."""
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    att = await svc._att._get_or_404(att_id)  # noqa: SLF001
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    names = (
        await _resolve_user_names(db, [att.started_by_user_id])
        if att.started_by_user_id else {}
    )
    return _att_to_queue_item(att, names.get(att.started_by_user_id))


async def _queue_to_items(
    app_db: AsyncSession, rows,
) -> list[ClnQueueItem]:
    user_ids = [r.started_by_user_id for r in rows if r.started_by_user_id]
    names = await _resolve_user_names(app_db, user_ids)
    return [_att_to_queue_item(r, names.get(r.started_by_user_id)) for r in rows]


@router.get("/triagem", response_model=list[ClnQueueItem])
async def list_triagem_queue(
    db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[ClnQueueItem]:
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.enabled or not eff.triagem_enabled or not eff.triagem_sector_name:
        return []
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.list_triagem(ctx.facility_id, eff.triagem_sector_name)
    return await _queue_to_items(db, rows)


@router.get("/atendimento", response_model=list[ClnQueueItem])
async def list_atendimento_queue(
    db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[ClnQueueItem]:
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.enabled or not eff.atendimento_sector_name:
        return []
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.list_atendimento(ctx.facility_id, eff.atendimento_sector_name)
    return await _queue_to_items(db, rows)


# ─── Ações de ticket ──────────────────────────────────────────────────

@router.post("/tickets/{att_id}/call", response_model=ClnQueueItem)
async def cln_call(
    att_id: UUID, db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.call(att_id, user.id, user_name=user.name)
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    return _att_to_queue_item(att)


@router.post("/tickets/{att_id}/start", response_model=ClnQueueItem)
async def cln_start(
    att_id: UUID, db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.start(att_id, user.id, user_name=user.name)
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    return _att_to_queue_item(att)


@router.post("/tickets/{att_id}/release", response_model=ClnQueueItem)
async def cln_release(
    att_id: UUID, db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    """Triagem libera ticket pra fila de atendimento (muda sector_name
    pro ``atendimento_sector_name`` configurado)."""
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.atendimento_sector_name:
        raise HTTPException(
            status_code=409,
            detail="Setor de atendimento não configurado.",
        )
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.release_to_atendimento(
        att_id, user.id, eff.atendimento_sector_name, user_name=user.name,
    )
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    return _att_to_queue_item(att)


@router.post("/tickets/{att_id}/finish", response_model=ClnQueueItem)
async def cln_finish(
    att_id: UUID, db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.finish(att_id, user.id, user_name=user.name)
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    return _att_to_queue_item(att)


@router.post("/tickets/{att_id}/cancel", response_model=ClnQueueItem)
async def cln_cancel(
    att_id: UUID, payload: CancelInput,
    db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.cancel(att_id, user.id, payload.reason, user_name=user.name)
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    return _att_to_queue_item(att)
