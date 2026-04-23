"""Endpoints de atendimento — recepção (totem + console)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.schema_base import CamelModel

from app.core.deps import (
    DB,
    CurrentContextDep,
    CurrentUserDep,
    TenantDB,
    Valkey,
)
from app.modules.attendances.schemas import (
    AttendanceEventOut,
    ActiveTicketInfo,
    AttendanceListItem,
    AttendanceRead,
    CancelInput,
    EmitTicketInput,
    EmitTicketOutput,
    FaceCandidate,
    FaceMatchOutput,
    ForwardInput,
    ManualEmitInput,
    OrderReason,
)
from app.modules.attendances.service import AttendanceService
from app.modules.devices.models import Device
from app.modules.devices.service import DeviceService
from app.modules.hsp import face_service
from app.modules.tenants.models import Facility, Municipality
from app.tenant_models.attendances import Attendance
from app.tenant_models.patients import Patient


router = APIRouter(prefix="/rec", tags=["rec-attendances"])


# ─── Dep de device (X-Device-Token) ──────────────────────────────────────

async def current_device(
    db: DB,
    x_device_token: Annotated[str, Header(alias="X-Device-Token")],
) -> Device:
    return await DeviceService(db).authenticate_by_token(x_device_token)


CurrentDeviceDep = Annotated[Device, Depends(current_device)]


# ─── Dep de tenant DB pro device (sem user autenticado) ──────────────────

async def tenant_db_for_device(
    device: CurrentDeviceDep, db: DB,
) -> AsyncIterator[AsyncSession]:
    """Abre sessão no schema do município da facility do device."""
    from app.db.dialect import adapter_for_engine
    from app.db.engine_registry import get_registry

    if device.facility_id is None:
        raise HTTPException(status_code=400, detail="Device sem unidade vinculada.")
    fac = await db.get(Facility, device.facility_id)
    if fac is None:
        raise HTTPException(status_code=404, detail="Unidade não encontrada.")
    mun = await db.get(Municipality, fac.municipality_id)
    if mun is None:
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    registry = get_registry()
    eng = registry.tenant_engine(mun.ibge) or registry.app_engine
    adapter = adapter_for_engine(eng)

    async with async_sessionmaker(bind=eng, expire_on_commit=False)() as session:
        conn = await session.connection()
        await adapter.set_search_path(conn, mun.ibge)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


TenantDBForDeviceDep = Annotated[AsyncSession, Depends(tenant_db_for_device)]


# ─── POST /tickets — totem emite ──────────────────────────────────────────

@router.post("/tickets", response_model=EmitTicketOutput, status_code=201)
async def emit_ticket(
    payload: EmitTicketInput,
    db: DB,
    tenant_db: TenantDBForDeviceDep,
    valkey: Valkey,
    device: CurrentDeviceDep,
) -> EmitTicketOutput:
    svc = AttendanceService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att, handover = await svc.emit_ticket(device, payload)
    return EmitTicketOutput(
        id=att.id,
        ticket_number=att.ticket_number,
        priority=att.priority,
        patient_name=att.patient_name,
        patient_id=att.patient_id,
        handover=handover,
    )


# ─── Console da recepção (user autenticado) ───────────────────────────────

@router.post("/tickets/manual", response_model=EmitTicketOutput, status_code=201)
async def emit_manual_ticket(
    payload: ManualEmitInput,
    db: DB, tenant_db: TenantDB,
    valkey: Valkey, ctx: CurrentContextDep, user: CurrentUserDep,
) -> EmitTicketOutput:
    """Recepção cria atendimento diretamente pra um paciente cadastrado,
    sem usar o totem físico. Usa a numeração de algum totem da unidade."""
    svc = AttendanceService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att, handover = await svc.emit_manual(
        facility_id=ctx.facility_id,
        patient_id=payload.patient_id,
        priority=payload.priority,
        user_id=user.id,
        user_name=user.name,
    )
    return EmitTicketOutput(
        id=att.id,
        ticket_number=att.ticket_number,
        priority=att.priority,
        patient_name=att.patient_name,
        patient_id=att.patient_id,
        handover=handover,
    )


@router.get("/tickets", response_model=list[AttendanceListItem])
async def list_tickets(
    db: DB, tenant_db: TenantDB, ctx: CurrentContextDep,
    include_closed: bool = False,
) -> list[AttendanceListItem]:
    # Resolve o modo de ordenação efetivo (defaults → município → unidade)
    # — atendentes veem a fila na ordem configurada pelo admin.
    from app.modules.rec.service import RecConfigService
    rec_cfg = await RecConfigService(db).effective_for_facility(
        ctx.facility_id, ctx.municipality_id,
    )
    order_mode = rec_cfg.recepcao.queue_order_mode

    svc = AttendanceService(app_db=db, tenant_db=tenant_db)
    rows, reasons_map = await svc.list_for_facility(
        ctx.facility_id, include_closed=include_closed, order_mode=order_mode,
    )
    out: list[AttendanceListItem] = []
    for att, handover in rows:
        base = AttendanceRead.model_validate(att)
        reasons = [
            OrderReason(tag=r.tag, contrib=r.contrib, note=r.note)
            for r in reasons_map.get(att.id, [])
        ]
        out.append(AttendanceListItem(
            **base.model_dump(),
            handover=handover,
            order_reasons=reasons,
        ))
    return out


@router.get(
    "/tickets/{att_id}/events",
    response_model=list[AttendanceEventOut],
)
async def list_ticket_events(
    att_id: UUID,
    db: DB, tenant_db: TenantDB, ctx: CurrentContextDep,
    _user: CurrentUserDep,
) -> list[AttendanceEventOut]:
    """Timeline do atendimento — toda ação granular (chegada, chamadas,
    rechamadas, encaminhamentos, cancelamento, etc.)."""
    svc = AttendanceService(app_db=db, tenant_db=tenant_db)
    att = await svc._get_or_404(att_id)  # noqa: SLF001
    _assert_same_facility(att, ctx.facility_id)
    rows = await svc.list_events(att_id)
    return [AttendanceEventOut.model_validate(r, from_attributes=True) for r in rows]


class _PatientVisitSummary(CamelModel):
    """Resumo de histórico do paciente na unidade atual.

    Usado pela tela de atendimento pra dar contexto à atendente: "é a
    primeira vez" / "voltou depois de 20 dias" / "frequenta toda semana".
    """
    total_visits: int
    last_visit_at: datetime | None = None


@router.get("/patients/{patient_id}/visit-summary", response_model=_PatientVisitSummary)
async def patient_visit_summary(
    patient_id: UUID,
    tenant_db: TenantDB, ctx: CurrentContextDep,
    _user: CurrentUserDep,
) -> _PatientVisitSummary:
    """Total de atendimentos + data da última visita (excluindo ativa).

    Filtra por unidade atual — "última visita aqui". Exclui atendimentos
    ativos (a sessão em curso não conta como "visita passada").
    """
    # Total (inclui ativo)
    total = await tenant_db.scalar(
        select(func.count(Attendance.id))
        .where(Attendance.patient_id == patient_id)
        .where(Attendance.facility_id == ctx.facility_id)
    ) or 0

    # Última finalizada (status NÃO-ativo — ignora sessão corrente)
    last = await tenant_db.scalar(
        select(Attendance.arrived_at)
        .where(Attendance.patient_id == patient_id)
        .where(Attendance.facility_id == ctx.facility_id)
        .where(Attendance.status.not_in(Attendance.ACTIVE_STATUSES))
        .order_by(Attendance.arrived_at.desc())
        .limit(1)
    )
    return _PatientVisitSummary(total_visits=total, last_visit_at=last)


@router.post("/tickets/{att_id}/call", response_model=AttendanceRead)
async def call_ticket(
    att_id: UUID, db: DB, tenant_db: TenantDB,
    valkey: Valkey, ctx: CurrentContextDep, user: CurrentUserDep,
) -> AttendanceRead:
    svc = AttendanceService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc._get_or_404(att_id)  # noqa: SLF001
    _assert_same_facility(att, ctx.facility_id)
    att = await svc.call(att_id, user.id, user_name=user.name)
    return AttendanceRead.model_validate(att)


@router.post("/tickets/{att_id}/start", response_model=AttendanceRead)
async def start_ticket(
    att_id: UUID, db: DB, tenant_db: TenantDB,
    valkey: Valkey, ctx: CurrentContextDep, user: CurrentUserDep,
) -> AttendanceRead:
    svc = AttendanceService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc._get_or_404(att_id)  # noqa: SLF001
    _assert_same_facility(att, ctx.facility_id)
    att = await svc.start(att_id, user.id, user_name=user.name)
    return AttendanceRead.model_validate(att)


@router.post("/tickets/{att_id}/forward", response_model=AttendanceRead)
async def forward_ticket(
    att_id: UUID, payload: ForwardInput, db: DB, tenant_db: TenantDB,
    valkey: Valkey, ctx: CurrentContextDep, user: CurrentUserDep,
) -> AttendanceRead:
    svc = AttendanceService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc._get_or_404(att_id)  # noqa: SLF001
    _assert_same_facility(att, ctx.facility_id)
    att = await svc.forward(att_id, user.id, payload, user_name=user.name)
    return AttendanceRead.model_validate(att)


@router.post("/tickets/{att_id}/cancel", response_model=AttendanceRead)
async def cancel_ticket(
    att_id: UUID, payload: CancelInput, db: DB, tenant_db: TenantDB,
    valkey: Valkey, ctx: CurrentContextDep, user: CurrentUserDep,
) -> AttendanceRead:
    svc = AttendanceService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc._get_or_404(att_id)  # noqa: SLF001
    _assert_same_facility(att, ctx.facility_id)
    att = await svc.cancel(att_id, user.id, payload.reason, user_name=user.name)
    return AttendanceRead.model_validate(att)


@router.post("/tickets/{att_id}/assume-handover", response_model=AttendanceRead)
async def assume_handover(
    att_id: UUID, db: DB, tenant_db: TenantDB,
    valkey: Valkey, ctx: CurrentContextDep, user: CurrentUserDep,
) -> AttendanceRead:
    svc = AttendanceService(app_db=db, tenant_db=tenant_db, valkey=valkey)
    att = await svc._get_or_404(att_id)  # noqa: SLF001
    _assert_same_facility(att, ctx.facility_id)
    att = await svc.assume_handover(att_id, user.id, user_name=user.name)
    return AttendanceRead.model_validate(att)


# ─── Info da unidade (totem — device auth) ───────────────────────────────

@router.get("/device/facility-info")
async def device_facility_info(
    db: DB,
    device: CurrentDeviceDep,
) -> dict:
    """Info da unidade/município pro totem exibir no rodapé.
    Device-auth — usa o facility_id vinculado ao device."""
    if device.facility_id is None:
        raise HTTPException(status_code=400, detail="Device sem unidade vinculada.")
    facility = await db.get(Facility, device.facility_id)
    if facility is None:
        raise HTTPException(status_code=404, detail="Unidade não encontrada.")
    municipality = await db.get(Municipality, facility.municipality_id)
    if municipality is None:
        raise HTTPException(status_code=404, detail="Município não encontrado.")
    return {
        "facilityName": facility.name,
        "facilityShortName": facility.short_name,
        "municipalityName": municipality.name,
        "municipalityUf": municipality.state,
        "timezone": municipality.timezone or "America/Sao_Paulo",
    }


# ─── Foto do paciente (totem — device auth) ──────────────────────────────

@router.get("/patients/{patient_id}/photo")
async def get_patient_photo(
    patient_id: UUID,
    db: DB,
    tenant_db: TenantDBForDeviceDep,
    device: CurrentDeviceDep,
) -> Response:
    """Serve a foto atual do paciente pro totem (device auth).
    Usado na tela de confirmação após match facial."""
    from app.db.file_model import TenantFile
    from app.services.storage import get_storage
    from app.tenant_models.patients import Patient, PatientPhoto

    if device.type != "totem":
        raise HTTPException(status_code=400, detail="Device não é do tipo totem.")

    patient = await tenant_db.get(Patient, patient_id)
    if patient is None or not patient.current_photo_id:
        raise HTTPException(status_code=404, detail="Foto não disponível.")

    photo = await tenant_db.get(PatientPhoto, patient.current_photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="Foto não disponível.")

    # Carrega do storage (file_id) ou do BLOB embutido (legacy).
    data: bytes | None = None
    if photo.file_id:
        tf = await tenant_db.get(TenantFile, photo.file_id)
        if tf and tf.storage_key:
            storage = get_storage()
            data = await storage.download(tf.storage_key)
    if data is None and photo.content is not None:
        data = bytes(photo.content)
    if data is None:
        raise HTTPException(status_code=404, detail="Foto não encontrada.")

    return Response(
        content=data,
        media_type=photo.mime_type or "image/jpeg",
        headers={"Cache-Control": "private, max-age=60"},
    )


# ─── Lookup por doc (totem — device auth) ────────────────────────────────

class _DocLookupInput(CamelModel):
    doc_type: Annotated[str, Field(pattern="^(cpf|cns)$")]
    doc_value: Annotated[str, Field(min_length=1, max_length=15)]


@router.post("/doc-lookup", response_model=FaceCandidate | None)
async def doc_lookup(
    payload: _DocLookupInput,
    db: DB,
    tenant_db: TenantDBForDeviceDep,
    device: CurrentDeviceDep,
) -> FaceCandidate | None:
    """Totem busca paciente pelo CPF/CNS digitado. Retorna dados
    mascarados + info de atendimento ativo se houver. Reusa o mesmo
    shape do face-match pra o frontend tratar ambos os fluxos igual."""
    if device.type != "totem":
        raise HTTPException(status_code=400, detail="Device não é do tipo totem.")

    doc_value = payload.doc_value.strip()
    if not doc_value:
        return None

    field = Patient.cpf if payload.doc_type == "cpf" else Patient.cns
    patient = await tenant_db.scalar(
        select(Patient).where(field == doc_value).limit(1)
    )
    if patient is None:
        return None

    # Atendimento ativo pra sugerir o "já está na fila" igual no face.
    active_info: ActiveTicketInfo | None = None
    active = await tenant_db.scalar(
        select(Attendance)
        .where(Attendance.patient_id == patient.id)
        .where(Attendance.status.in_(Attendance.ACTIVE_STATUSES))
        .order_by(Attendance.arrived_at.desc())
        .limit(1)
    )
    if active is not None:
        fac = await db.get(Facility, active.facility_id)
        active_info = ActiveTicketInfo(
            ticket_number=active.ticket_number,
            status=active.status,  # type: ignore[arg-type]
            facility_short_name=fac.short_name if fac else "—",
            same_facility=(active.facility_id == device.facility_id),
        )

    return FaceCandidate(
        patient_id=patient.id,
        name=patient.name,
        social_name=patient.social_name.strip() or None,
        cpf_masked=_mask_cpf(patient.cpf),
        cns_masked=_mask_cns(patient.cns),
        similarity=1.0,   # doc bateu exato
        has_photo=patient.current_photo_id is not None,
        active_ticket=active_info,
    )


# ─── Face (totem — device auth) ───────────────────────────────────────────

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/face-match", response_model=FaceMatchOutput)
async def face_match(
    db: DB,
    tenant_db: TenantDBForDeviceDep,
    device: CurrentDeviceDep,
    file: Annotated[UploadFile, File(description="Foto capturada no totem")],
) -> FaceMatchOutput:
    """Totem envia foto → devolve candidatos (com CPF/CNS mascarados).
    Retorna lista vazia quando nenhum rosto é detectado ou a qualidade é
    baixa — o fluxo do totem simplesmente segue pro input de CPF/CNS."""
    if device.type != "totem":
        raise HTTPException(status_code=400, detail="Device não é do tipo totem.")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máx. 10 MB).")
    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_MIMES:
        raise HTTPException(status_code=415, detail="Formato não suportado.")

    svc = AttendanceService(app_db=db, tenant_db=tenant_db)
    try:
        resp = await svc.face_match(raw)
    except face_service.FaceError as e:
        # No totem, erros de negócio viram resposta "sem rosto / baixa
        # qualidade" sem candidatos — o frontend segue pro próximo passo.
        if e.code in ("no_face", "low_quality"):
            return FaceMatchOutput(face_detected=False, detection_score=None, candidates=[])
        raise HTTPException(status_code=422, detail={"code": e.code, "message": str(e)}) from e

    # Busca CNS + atendimento ativo em lote.
    candidate_ids = [c.patient_id for c in resp.candidates]
    cns_map: dict[UUID, str | None] = {}
    active_map: dict[UUID, ActiveTicketInfo] = {}
    if candidate_ids:
        rows = await tenant_db.execute(
            select(Patient.id, Patient.cns).where(Patient.id.in_(candidate_ids))
        )
        cns_map = {pid: cns for pid, cns in rows.all()}

        # Atendimentos ativos em qualquer unidade do município. Pega o
        # mais recente por paciente.
        atts = (await tenant_db.scalars(
            select(Attendance)
            .where(Attendance.patient_id.in_(candidate_ids))
            .where(Attendance.status.in_(Attendance.ACTIVE_STATUSES))
            .order_by(Attendance.arrived_at.desc())
        )).all()
        fac_ids = {a.facility_id for a in atts}
        fac_rows = (await db.scalars(
            select(Facility).where(Facility.id.in_(fac_ids))
        )).all() if fac_ids else []
        fac_map = {f.id: f for f in fac_rows}
        for a in atts:
            if a.patient_id in active_map:
                continue  # já registramos o mais recente
            fac = fac_map.get(a.facility_id)
            active_map[a.patient_id] = ActiveTicketInfo(
                ticket_number=a.ticket_number,
                status=a.status,  # type: ignore[arg-type]
                facility_short_name=fac.short_name if fac else "—",
                same_facility=(a.facility_id == device.facility_id),
            )

    return FaceMatchOutput(
        face_detected=True,
        detection_score=resp.detection.get("score"),
        candidates=[
            FaceCandidate(
                patient_id=c.patient_id,
                name=c.name,
                social_name=c.social_name or None,
                cpf_masked=_mask_cpf(c.cpf),
                cns_masked=_mask_cns(cns_map.get(c.patient_id)),
                similarity=c.similarity,
                has_photo=c.has_photo,
                active_ticket=active_map.get(c.patient_id),
            )
            for c in resp.candidates
        ],
    )


@router.post("/face-enroll", status_code=204)
async def face_enroll(
    db: DB,
    tenant_db: TenantDBForDeviceDep,
    device: CurrentDeviceDep,
    file: Annotated[UploadFile, File(description="Foto capturada no totem")],
    patient_id: Annotated[UUID, Form()],
) -> Response:
    """Aprende com a foto do totem — vincula ao gallery do paciente e
    atualiza o embedding. Falhas não interrompem o fluxo do totem."""
    if device.type != "totem":
        raise HTTPException(status_code=400, detail="Device não é do tipo totem.")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máx. 10 MB).")
    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_MIMES:
        raise HTTPException(status_code=415, detail="Formato não suportado.")

    svc = AttendanceService(app_db=db, tenant_db=tenant_db)
    try:
        await svc.face_enroll_for_patient(device, patient_id, raw, mime)
    except Exception:
        # Learning é best-effort — loga mas não interrompe o totem.
        import logging
        logging.getLogger(__name__).exception("face_enroll_failed")
    return Response(status_code=204)


# ─── Helpers ──────────────────────────────────────────────────────────────

def _assert_same_facility(att, ctx_facility_id: UUID) -> None:
    if str(att.facility_id) != str(ctx_facility_id):
        raise HTTPException(
            status_code=403,
            detail="Atendimento não pertence à sua unidade.",
        )


def _mask_cpf(cpf: str | None) -> str | None:
    if not cpf:
        return None
    digits = "".join(c for c in cpf if c.isdigit())
    if len(digits) != 11:
        return cpf
    return f"***.***.***-{digits[-2:]}"


def _mask_cns(cns: str | None) -> str | None:
    if not cns:
        return None
    digits = "".join(c for c in cns if c.isdigit())
    if len(digits) < 4:
        return cns
    return f"{'*' * (len(digits) - 4)}{digits[-4:]}"
