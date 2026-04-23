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
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.cln.campinas_protocol import CAMPINAS_PROTOCOL, Complaint
from app.modules.cln.schemas import (
    AddProcedureInput,
    AttendanceProcedureOut,
    CancelInput,
    ClnConfigRead,
    ClnConfigUpdate,
    ClnQueueItem,
    EffectiveClnConfig,
    PendingAutoProcedureOut,
    PriorityGroupCreate,
    PriorityGroupOut,
    PriorityGroupUpdate,
    ProcedureSearchResultOut,
    ReferInput,
    ReferralGuideOut,
    SetPriorityGroupInput,
    TriageInput,
    TriageRecordOut,
    UbsOut,
)
from app.modules.tenants.models import FacilityType
from app.tenant_models.attendances import PriorityGroup
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

def _att_to_queue_item(
    att, started_by_name: str | None = None,
    priority_group_label: str | None = None,
    triage_count: int = 0,
) -> ClnQueueItem:
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
        priority_group_id=att.priority_group_id,
        priority_group_label=priority_group_label,
        triage_count=triage_count,
    )


async def _resolve_priority_group_names(
    tenant_db: AsyncSession, group_ids: list[UUID],
) -> dict[UUID, str]:
    if not group_ids:
        return {}
    rows = await tenant_db.scalars(
        _select(PriorityGroup).where(PriorityGroup.id.in_(set(group_ids)))
    )
    return {g.id: g.name for g in rows.all()}


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
    group_labels = (
        await _resolve_priority_group_names(tenant_db, [att.priority_group_id])
        if att.priority_group_id else {}
    )
    counts = await svc.triage_counts([att.id])
    return _att_to_queue_item(
        att,
        names.get(att.started_by_user_id),
        group_labels.get(att.priority_group_id) if att.priority_group_id else None,
        counts.get(att.id, 0),
    )


async def _queue_to_items(
    app_db: AsyncSession, rows, tenant_db: AsyncSession | None = None,
) -> list[ClnQueueItem]:
    user_ids = [r.started_by_user_id for r in rows if r.started_by_user_id]
    names = await _resolve_user_names(app_db, user_ids)
    group_labels: dict[UUID, str] = {}
    triage_counts: dict[UUID, int] = {}
    if tenant_db is not None:
        group_ids = [r.priority_group_id for r in rows if r.priority_group_id]
        group_labels = await _resolve_priority_group_names(tenant_db, group_ids)
        svc = ClnService(app_db=app_db, tenant_db=tenant_db)
        triage_counts = await svc.triage_counts([r.id for r in rows])
    return [
        _att_to_queue_item(
            r,
            names.get(r.started_by_user_id),
            group_labels.get(r.priority_group_id) if r.priority_group_id else None,
            triage_counts.get(r.id, 0),
        )
        for r in rows
    ]


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
    return await _queue_to_items(db, rows, tenant_db)


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
    return await _queue_to_items(db, rows, tenant_db)


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


@router.post("/tickets/{att_id}/triagem", response_model=TriageRecordOut)
async def cln_triage(
    att_id: UUID, payload: TriageInput,
    db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> TriageRecordOut:
    """Grava os dados da triagem E libera o ticket pra fila de atendimento
    numa única operação. Usa o ``atendimentoSectorName`` configurado no
    CLN da unidade como destino."""
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.atendimento_sector_name:
        raise HTTPException(
            status_code=409,
            detail="Setor de atendimento não configurado.",
        )
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att, rec = await svc.triage_and_release(
        att_id, user.id, eff.atendimento_sector_name, payload,
        user_name=user.name,
    )
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    return TriageRecordOut.model_validate(rec, from_attributes=True)


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
    force: Annotated[bool, Query()] = False,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.finish(
        att_id, user.id, user_name=user.name,
        cbo_id=ctx.cbo_id, force=force,
    )
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


@router.post("/tickets/{att_id}/retriagem", response_model=ClnQueueItem)
async def cln_retriage(
    att_id: UUID,
    db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    """Devolve ticket pra fila de triagem (Fase E — retriagem). Só
    elegível se já passou pela triagem antes."""
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.triagem_enabled or not eff.triagem_sector_name:
        raise HTTPException(
            status_code=409,
            detail="Triagem não está habilitada nesta unidade.",
        )
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.retriage(
        att_id, user.id, eff.triagem_sector_name, user_name=user.name,
    )
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    counts = await svc.triage_counts([att.id])
    return _att_to_queue_item(att, triage_count=counts.get(att.id, 0))


@router.get(
    "/tickets/{att_id}/triage-history",
    response_model=list[TriageRecordOut],
)
async def cln_triage_history(
    att_id: UUID, db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[TriageRecordOut]:
    """Histórico de registros de triagem do ticket (mais recente primeiro)."""
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    att = await svc._att._get_or_404(att_id)  # noqa: SLF001
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    rows = await svc.list_triage_history(att_id)
    return [TriageRecordOut.model_validate(r, from_attributes=True) for r in rows]


# ─── Encaminhamento pra UBS (Fase H) ─────────────────────────────────

@router.get("/ubs", response_model=list[UbsOut])
async def list_ubs(
    db: DB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[UbsOut]:
    """Lista UBSs ativas do município pra o select de encaminhamento."""
    rows = await db.scalars(
        _select(Facility)
        .where(Facility.municipality_id == ctx.municipality_id)
        .where(Facility.type == FacilityType.UBS)
        .where(Facility.archived == False)  # noqa: E712
        .order_by(Facility.name)
    )
    return [
        UbsOut(
            id=f.id,
            name=f.name,
            short_name=f.short_name,
            cnes=f.cnes,
        )
        for f in rows.all()
    ]


@router.post("/tickets/{att_id}/refer", response_model=ClnQueueItem)
async def cln_refer(
    att_id: UUID, payload: ReferInput,
    db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    """Encaminha paciente não urgente (risco 4/5) pra UBS — Fase H."""
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.refer_to_ubs(
        att_id, payload.ubs_facility_id, user.id,
        municipality_id=ctx.municipality_id, user_name=user.name,
    )
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    counts = await svc.triage_counts([att.id])
    return _att_to_queue_item(att, triage_count=counts.get(att.id, 0))


_RISK_LABEL = {
    1: "Emergência",
    2: "Muito urgente",
    3: "Urgente",
    4: "Pouco urgente",
    5: "Não urgente",
}


@router.get(
    "/tickets/{att_id}/referral-guide",
    response_model=ReferralGuideOut,
)
async def get_referral_guide(
    att_id: UUID, db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ReferralGuideOut:
    """Dados consolidados pra impressão da guia de encaminhamento."""
    from app.modules.cln.campinas_protocol import complaint_by_code
    from app.tenant_models.attendances import TriageRecord

    svc = ClnService(app_db=db, tenant_db=tenant_db)
    att = await svc._att._get_or_404(att_id)  # noqa: SLF001
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    if att.status != "referred" or att.referred_to_facility_id is None:
        raise HTTPException(
            status_code=409,
            detail="Ticket não foi encaminhado pra UBS.",
        )

    last = await tenant_db.scalar(
        _select(TriageRecord)
        .where(TriageRecord.attendance_id == att.id)
        .order_by(TriageRecord.created_at.desc()).limit(1)
    )
    ubs = await db.get(Facility, att.referred_to_facility_id)
    origin = await db.get(Facility, att.facility_id)
    referrer_name = ""
    if att.referred_by_user_id:
        m = await _resolve_user_names(db, [att.referred_by_user_id])
        referrer_name = m.get(att.referred_by_user_id, "") or ""

    complaint = complaint_by_code(last.complaint_code) if (last and last.complaint_code) else None

    # Patient data — best-effort (pode ser anônimo).
    patient_birth = None
    patient_sex = None
    if att.patient_id:
        from app.tenant_models.patients import Patient
        pat = await tenant_db.get(Patient, att.patient_id)
        if pat is not None:
            patient_birth = pat.birth_date.isoformat() if pat.birth_date else None
            patient_sex = pat.sex

    risk = int(last.risk_classification) if last else 0

    return ReferralGuideOut(
        ticket_id=att.id,
        ticket_number=att.ticket_number,
        patient_name=att.patient_name,
        patient_doc_type=att.doc_type,
        patient_doc_value=att.doc_value,
        patient_birth_date=patient_birth,
        patient_sex=patient_sex,
        risk_classification=risk,
        risk_label=_RISK_LABEL.get(risk, "—"),
        complaint_code=(last.complaint_code if last else None),
        complaint_name=(complaint.name if complaint else None),
        queixa=(last.queixa if last else ""),
        observacoes=(last.observacoes if last else ""),
        origin_facility_id=att.facility_id,
        origin_facility_name=(origin.name if origin else "—"),
        ubs_id=ubs.id if ubs else att.referred_to_facility_id,
        ubs_name=(ubs.name if ubs else "—"),
        ubs_short_name=(ubs.short_name if ubs else ""),
        ubs_cnes=(ubs.cnes if ubs else None),
        referred_at=att.referred_at or att.updated_at,
        referred_by_user_id=att.referred_by_user_id,
        referred_by_user_name=referrer_name,
    )


# ─── Protocolo Campinas (Fase G) ─────────────────────────────────────

@router.get("/campinas/complaints", response_model=list[Complaint])
async def list_campinas_complaints(
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[Complaint]:
    """Catálogo de fluxogramas do protocolo Campinas — lista estática
    no código (Fase G inicial). Migração pra DB + CRUD por município
    fica pra Fase G2 se houver demanda."""
    _ = ctx  # só valida que tem contexto
    return CAMPINAS_PROTOCOL


# ─── Procedimentos SIGTAP (Fase F) ───────────────────────────────────

def _procedure_to_out(
    row, proc,
) -> AttendanceProcedureOut:
    return AttendanceProcedureOut(
        id=row.id,
        attendance_id=row.attendance_id,
        codigo=row.codigo,
        nome=(proc.nome if proc is not None else "— procedimento revogado"),
        competencia=row.competencia,
        quantidade=row.quantidade,
        source=row.source,  # type: ignore[arg-type]
        complexidade=(proc.complexidade if proc is not None else None),
        marked_by_user_id=row.marked_by_user_id,
        marked_by_user_name=row.marked_by_user_name,
        marked_at=row.marked_at,
    )


@router.get(
    "/tickets/{att_id}/procedures",
    response_model=list[AttendanceProcedureOut],
)
async def list_attendance_procedures(
    att_id: UUID, db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[AttendanceProcedureOut]:
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    att = await svc._att._get_or_404(att_id)  # noqa: SLF001
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    rows = await svc.list_procedures(att_id)
    return [_procedure_to_out(r, p) for r, p in rows]


@router.post(
    "/tickets/{att_id}/procedures",
    response_model=AttendanceProcedureOut | None,
    status_code=201,
)
async def add_attendance_procedure(
    att_id: UUID, payload: AddProcedureInput,
    db: DB, tenant_db: TenantDB,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> AttendanceProcedureOut | None:
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    att = await svc._att._get_or_404(att_id)  # noqa: SLF001
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    row = await svc.add_procedure(
        att_id, payload.codigo,
        user_id=user.id, user_name=user.name,
        quantidade=payload.quantidade, source="manual",
        cbo_id=ctx.cbo_id,
    )
    if row is None:
        return None  # já estava marcado — 201 com body vazio é semânticamente ok
    # enrich
    rows = await svc.list_procedures(att_id)
    match = next((r for r in rows if r[0].id == row.id), None)
    return _procedure_to_out(*match) if match else None


@router.delete(
    "/tickets/{att_id}/procedures/{procedure_id}",
    status_code=204,
)
async def remove_attendance_procedure(
    att_id: UUID, procedure_id: UUID,
    db: DB, tenant_db: TenantDB,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> None:
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    att = await svc._att._get_or_404(att_id)  # noqa: SLF001
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    await svc.remove_procedure(att_id, procedure_id, user.id, user.name)


@router.get(
    "/tickets/{att_id}/procedures-pending",
    response_model=list[PendingAutoProcedureOut],
)
async def list_pending_auto_procedures(
    att_id: UUID, db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[PendingAutoProcedureOut]:
    """Códigos que serão auto-marcados no próximo checkpoint (liberar /
    finalizar) — feedback visual "ghost" pra tela de triagem/atendimento."""
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.pending_auto_procedures(
        att_id,
        triagem_sector_name=eff.triagem_sector_name,
        atendimento_sector_name=eff.atendimento_sector_name,
        cbo_id=ctx.cbo_id,
    )
    return [
        PendingAutoProcedureOut(
            codigo=code,
            nome=(proc.nome if proc is not None else "— procedimento não encontrado"),
            source=source,  # type: ignore[arg-type]
            trigger=trigger,  # type: ignore[arg-type]
        )
        for code, proc, source, trigger in rows
    ]


@router.get(
    "/procedures/search",
    response_model=list[ProcedureSearchResultOut],
)
async def search_procedures(
    db: DB, tenant_db: TenantDB,
    q: Annotated[str, Query()] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[ProcedureSearchResultOut]:
    """Busca procedimentos compatíveis com o CBO do profissional.
    Sem CBO vinculado ao contexto, retorna lista vazia."""
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.search_procedures_for_cbo(ctx.cbo_id, q, limit=limit)
    return [
        ProcedureSearchResultOut(
            codigo=r.codigo,
            nome=r.nome,
            complexidade=r.complexidade,
            competencia=r.competencia,
        )
        for r in rows
    ]


@router.post("/tickets/{att_id}/evade", response_model=ClnQueueItem)
async def cln_evade(
    att_id: UUID, payload: CancelInput,
    db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    """Marca ticket como evadido (paciente não retornou após chamada)."""
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc.evade(att_id, user.id, payload.reason, user_name=user.name)
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    return _att_to_queue_item(att)


# ─── Histórico por fila ──────────────────────────────────────────────

@router.get("/triagem/encaminhados", response_model=list[ClnQueueItem])
async def list_triagem_encaminhados(
    db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[ClnQueueItem]:
    """Tickets liberados pela triagem nas últimas 24h."""
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.enabled:
        return []
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.list_triagem_encaminhados(
        ctx.facility_id, eff.atendimento_sector_name or "",
    )
    return await _queue_to_items(db, rows, tenant_db)


@router.get("/triagem/evadidos", response_model=list[ClnQueueItem])
async def list_triagem_evadidos(
    db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[ClnQueueItem]:
    """Evadidos que estavam na triagem nos últimos 7 dias."""
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.enabled or not eff.triagem_sector_name:
        return []
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.list_triagem_evadidos(ctx.facility_id, eff.triagem_sector_name)
    return await _queue_to_items(db, rows, tenant_db)


@router.get("/atendimento/encaminhados", response_model=list[ClnQueueItem])
async def list_atendimento_encaminhados(
    db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[ClnQueueItem]:
    """Atendimentos finalizados nas últimas 24h."""
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.enabled or not eff.atendimento_sector_name:
        return []
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.list_atendimento_encaminhados(
        ctx.facility_id, eff.atendimento_sector_name,
    )
    return await _queue_to_items(db, rows, tenant_db)


@router.get("/atendimento/evadidos", response_model=list[ClnQueueItem])
async def list_atendimento_evadidos(
    db: DB, tenant_db: TenantDB,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[ClnQueueItem]:
    """Evadidos que estavam no atendimento nos últimos 7 dias."""
    eff = await ClnConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    if not eff.enabled or not eff.atendimento_sector_name:
        return []
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.list_atendimento_evadidos(
        ctx.facility_id, eff.atendimento_sector_name,
    )
    return await _queue_to_items(db, rows, tenant_db)


# ─── Grupos prioritários — runtime ────────────────────────────────────

@router.get("/priority-groups", response_model=list[PriorityGroupOut])
async def list_runtime_priority_groups(
    db: DB, tenant_db: TenantDB,
    include_archived: Annotated[bool, Query(alias="includeArchived")] = False,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> list[PriorityGroupOut]:
    """Lista grupos prioritários do município — usado no select da triagem
    e em qualquer tela que precise categorizar um ticket."""
    _ = ctx  # só pra garantir que temos contexto válido
    svc = ClnService(app_db=db, tenant_db=tenant_db)
    rows = await svc.list_priority_groups(include_archived=include_archived)
    return [PriorityGroupOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/tickets/{att_id}/priority-group", response_model=ClnQueueItem)
async def set_ticket_priority_group(
    att_id: UUID, payload: SetPriorityGroupInput,
    db: DB, tenant_db: TenantDB, valkey: Valkey,
    user: CurrentUserDep,
    ctx: WorkContext = requires(permission="cln.module.access"),
) -> ClnQueueItem:
    """Seta (ou limpa) o grupo prioritário dum ticket. Sincroniza o
    boolean ``priority`` como efeito colateral."""
    svc = ClnService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc._att._get_or_404(att_id)  # noqa: SLF001
    if att.facility_id != ctx.facility_id:
        raise HTTPException(status_code=403, detail="Ticket de outra unidade.")
    att = await svc.set_ticket_priority_group(
        att_id, user.id, payload.priority_group_id, user_name=user.name,
    )
    group_labels = (
        await _resolve_priority_group_names(tenant_db, [att.priority_group_id])
        if att.priority_group_id else {}
    )
    names = (
        await _resolve_user_names(db, [att.started_by_user_id])
        if att.started_by_user_id else {}
    )
    return _att_to_queue_item(
        att,
        names.get(att.started_by_user_id),
        group_labels.get(att.priority_group_id) if att.priority_group_id else None,
    )


# ─── Grupos prioritários — admin MASTER ──────────────────────────────

async def _tenant_session_for_municipality(
    db: AsyncSession, municipality_id: UUID,
) -> AsyncSession:
    """Abre uma AsyncSession apontando pro schema do município.
    Caller é responsável por fechar via ``async with`` ou ``session.close()``.
    """
    from app.db.dialect import adapter_for_engine
    from app.db.engine_registry import get_registry
    from app.modules.tenants.models import Municipality

    mun = await db.scalar(_select(Municipality).where(Municipality.id == municipality_id))
    if mun is None:
        raise HTTPException(status_code=404, detail="Município não encontrado.")
    registry = get_registry()
    eng = registry.tenant_engine(mun.ibge)
    adapter = adapter_for_engine(eng)
    session = async_sessionmaker(bind=eng, expire_on_commit=False)()
    conn = await session.connection()
    await adapter.set_search_path(conn, mun.ibge)
    return session


@admin_router.get(
    "/priority-groups/municipalities/{municipality_id}",
    response_model=list[PriorityGroupOut],
)
async def admin_list_priority_groups(
    municipality_id: UUID, db: DB, _: MasterDep,
    include_archived: Annotated[bool, Query(alias="includeArchived")] = True,
) -> list[PriorityGroupOut]:
    session = await _tenant_session_for_municipality(db, municipality_id)
    try:
        svc = ClnService(app_db=db, tenant_db=session)
        rows = await svc.list_priority_groups(include_archived=include_archived)
        return [PriorityGroupOut.model_validate(r, from_attributes=True) for r in rows]
    finally:
        await session.close()


@admin_router.post(
    "/priority-groups/municipalities/{municipality_id}",
    response_model=PriorityGroupOut,
    status_code=201,
)
async def admin_create_priority_group(
    municipality_id: UUID, payload: PriorityGroupCreate, db: DB, _: MasterDep,
) -> PriorityGroupOut:
    session = await _tenant_session_for_municipality(db, municipality_id)
    try:
        svc = ClnService(app_db=db, tenant_db=session)
        row = await svc.create_priority_group(payload)
        await session.commit()
        return PriorityGroupOut.model_validate(row, from_attributes=True)
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@admin_router.patch(
    "/priority-groups/municipalities/{municipality_id}/{group_id}",
    response_model=PriorityGroupOut,
)
async def admin_update_priority_group(
    municipality_id: UUID, group_id: UUID,
    payload: PriorityGroupUpdate, db: DB, _: MasterDep,
) -> PriorityGroupOut:
    session = await _tenant_session_for_municipality(db, municipality_id)
    try:
        svc = ClnService(app_db=db, tenant_db=session)
        row = await svc.update_priority_group(group_id, payload)
        await session.commit()
        return PriorityGroupOut.model_validate(row, from_attributes=True)
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@admin_router.delete(
    "/priority-groups/municipalities/{municipality_id}/{group_id}",
    status_code=204,
)
async def admin_delete_priority_group(
    municipality_id: UUID, group_id: UUID, db: DB, _: MasterDep,
) -> None:
    session = await _tenant_session_for_municipality(db, municipality_id)
    try:
        svc = ClnService(app_db=db, tenant_db=session)
        await svc.delete_priority_group(group_id)
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
