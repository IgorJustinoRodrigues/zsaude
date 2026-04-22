"""Endpoints HSP — cadastro de paciente (contexto município)."""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import select

from app.core.audit import get_audit_context
from app.core.config import settings
from app.core.deps import DB, WorkContext, requires
from app.core.pagination import Page
from app.modules.audit.helpers import describe_change
from app.modules.audit.writer import write_audit
from app.modules.hsp.cadsus import client as cadsus_client
from app.modules.hsp.cadsus import mock as cadsus_mock
from app.modules.hsp.cadsus.schemas import CadsusSearchResponse
from app.modules.hsp.schemas import (
    PatientAddressInput,
    PatientAddressOut,
    PatientCreate,
    PatientFieldHistoryOut,
    PatientListItem,
    PatientPhotoOut,
    PatientRead,
    PatientUpdate,
)
from app.modules.hsp.service import PatientService, load_photo_bytes
from app.modules.users.models import User
from app.tenant_models.patients import Patient

router = APIRouter(prefix="/hsp", tags=["hsp"])

_MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}


async def _user_name(db, ctx: WorkContext) -> str:
    u = await db.scalar(select(User).where(User.id == ctx.user_id))
    return u.name if u else ""


async def _patient_name(db, patient_id: UUID) -> str:
    """Resolve ``patient.name`` para uso em audits legíveis."""
    name = await db.scalar(select(Patient.name).where(Patient.id == patient_id))
    return name or "(desconhecido)"


def _patient_to_read(p: Patient, docs: list | None = None) -> PatientRead:
    read = PatientRead.model_validate(p, from_attributes=True)
    read.has_photo = p.current_photo_id is not None
    # deficiencias é armazenado como list[str] (UUIDs em JSONB).
    read.deficiencias = [UUID(v) if isinstance(v, str) else v for v in (p.deficiencias or [])]
    if docs is not None:
        from app.modules.hsp.schemas import DocumentOut
        read.documents = [DocumentOut.model_validate(d, from_attributes=True) for d in docs]
    return read


def _patient_to_item(p: Patient) -> PatientListItem:
    return PatientListItem(
        id=p.id,
        prontuario=p.prontuario,
        name=p.name,
        social_name=p.social_name,
        cpf=p.cpf,
        cns=p.cns,
        birth_date=p.birth_date,
        sex=p.sex,
        cellphone=p.cellphone,
        phone=p.phone,
        active=p.active,
        has_photo=p.current_photo_id is not None,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


# ── List / Create ──────────────────────────────────────────────────────────

@router.get("/patients", response_model=Page[PatientListItem])
async def list_patients(
    db: DB,
    search: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    sort: str = Query(default="name"),
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    ctx: WorkContext = requires(permission="hsp.patient.view"),
) -> Page[PatientListItem]:
    svc = PatientService(db, ctx)
    rows, total = await svc.list_patients(
        search=search, active=active, page=page, page_size=page_size,
        sort=sort, dir_=dir,
    )
    # Audit só quando houve filtro intencional (evita ruído em navegação padrão).
    if search:
        actor = get_audit_context().user_name
        await write_audit(
            db, module="hsp", action="patient_search", severity="info",
            resource="patient", resource_id="",
            description=describe_change(
                actor=actor, verb="pesquisou pacientes",
                extra=f'termo "{search}" · {total} resultado(s)',
            ),
            details={"search": search, "total": total, "page": page},
        )
    return Page(items=[_patient_to_item(p) for p in rows], total=total,
                page=page, page_size=page_size)


@router.get("/patients/lookup", response_model=list[PatientListItem])
async def lookup_patients(
    db: DB,
    cpf: str | None = Query(default=None, description="CPF (com ou sem pontuação)"),
    cns: str | None = Query(default=None, description="CNS (15 dígitos)"),
    documento: str | None = Query(default=None, description="Número de documento (RG, CNH, etc.)"),
    name: str | None = Query(default=None, description="Nome / Nome social (ilike)"),
    birth_date: date | None = Query(default=None, description="Data de nascimento (combinada com name)"),
    mother_name: str | None = Query(default=None, description="Nome da mãe (ilike)"),
    father_name: str | None = Query(default=None, description="Nome do pai (ilike)"),
    limit: int = Query(default=10, ge=1, le=50),
    ctx: WorkContext = requires(permission="hsp.patient.view"),
) -> list[PatientListItem]:
    """Busca pré-cadastro: ajuda a evitar duplicatas. Aceita combinação de
    chaves; usa OR entre os tipos informados."""
    svc = PatientService(db, ctx)
    rows = await svc.lookup_patients(
        cpf=cpf, cns=cns, documento=documento,
        name=name, birth_date=birth_date,
        mother_name=mother_name, father_name=father_name,
        limit=limit,
    )
    # Lookup é sempre intencional (cadastro/deduplicação) — audita com
    # os critérios usados (CPF mascarado pra LGPD).
    actor = get_audit_context().user_name
    criteria: list[str] = []
    if cpf:         criteria.append(f"CPF ***{cpf[-2:] if len(cpf) >= 2 else ''}")
    if cns:         criteria.append(f"CNS ***{cns[-4:] if len(cns) >= 4 else ''}")
    if documento:   criteria.append(f'documento "{documento}"')
    if name:        criteria.append(f'nome "{name}"')
    if mother_name: criteria.append(f'nome da mãe "{mother_name}"')
    if father_name: criteria.append(f'nome do pai "{father_name}"')
    if birth_date:  criteria.append(f"nascimento {birth_date.isoformat()}")
    criteria_str = " · ".join(criteria) or "(sem critério)"
    await write_audit(
        db, module="hsp", action="patient_lookup", severity="info",
        resource="patient", resource_id="",
        description=describe_change(
            actor=actor, verb="consultou pré-cadastro",
            extra=f"{criteria_str} · {len(rows)} resultado(s)",
        ),
        details={
            "hasCpf": bool(cpf), "hasCns": bool(cns),
            "hasDocumento": bool(documento), "hasName": bool(name),
            "hasBirthDate": bool(birth_date), "results": len(rows),
        },
    )
    return [_patient_to_item(p) for p in rows]


@router.get("/cadsus/search", response_model=CadsusSearchResponse)
async def search_cadsus(
    db: DB,
    cpf: str | None = Query(default=None, description="CPF (com ou sem formatação)"),
    cns: str | None = Query(default=None, description="CNS (15 dígitos)"),
    nome: str | None = Query(default=None, min_length=2),
    data_nascimento: str | None = Query(default=None, description="AAAA-MM-DD"),
    nome_mae: str | None = Query(default=None, min_length=2),
    sexo: str | None = Query(default=None, pattern="^[MF]$"),
    ctx: WorkContext = requires(permission="hsp.patient.create"),
) -> CadsusSearchResponse:
    """Busca paciente no CadSUS (DATASUS PDQ Supplier).

    Credenciais: resolvidas do município ativo (``ctx.municipality_id``);
    fallback para variáveis de ambiente globais. Regra do DATASUS: se CNS
    ou CPF forem informados, os demais critérios são descartados.
    """
    # Modo mock — útil em dev sem credenciais.
    if settings.cadsus_mock:
        items = cadsus_mock.mock_search(
            cpf=cpf, cns=cns, nome=nome,
            data_nascimento=data_nascimento,
            nome_mae=nome_mae, sexo=sexo,
        )
        return CadsusSearchResponse(items=items, source="mock")

    # Credenciais: município ativo > setting global (cadsus.base) > env var.
    from app.modules.tenants.models import Municipality
    from app.modules.system.service import SettingsService

    from app.core.crypto import decrypt_secret

    mun = await db.scalar(select(Municipality).where(Municipality.id == ctx.municipality_id))
    user = (mun.cadsus_user if mun else "") or ""
    password = decrypt_secret(mun.cadsus_password if mun else "") or ""

    if not user or not password:
        base = await SettingsService(db).get("cadsus.base", {}) or {}
        if isinstance(base, dict):
            user = user or (base.get("user") or "")
            # Setting guarda senha cifrada (migration retrofit aplicou).
            password = password or decrypt_secret(base.get("password") or "")

    # Último fallback: env (dev/legado — sempre plaintext).
    user = user or settings.cadsus_user
    password = password or settings.cadsus_password

    if not user or not password:
        raise HTTPException(
            status_code=503,
            detail="Integração CadSUS não configurada (nem no município nem na base geral).",
        )

    try:
        items = await cadsus_client.search_cadsus(
            cpf=cpf, cns=cns, nome=nome,
            data_nascimento=data_nascimento,
            nome_mae=nome_mae, sexo=sexo,
            user=user, password=password,
        )
    except cadsus_client.CadsusError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    # PHI externa — severidade "warning" pra destacar na revisão de auditoria.
    actor = get_audit_context().user_name
    search_summary: list[str] = []
    if cpf:              search_summary.append(f"CPF ***{cpf[-2:] if len(cpf) >= 2 else ''}")
    if cns:              search_summary.append(f"CNS ***{cns[-4:] if len(cns) >= 4 else ''}")
    if nome:             search_summary.append(f'nome "{nome}"')
    if data_nascimento:  search_summary.append(f"nasc. {data_nascimento}")
    if nome_mae:         search_summary.append(f'mãe "{nome_mae}"')
    await write_audit(
        db, module="hsp", action="cadsus_search", severity="warning",
        resource="cadsus", resource_id="",
        description=describe_change(
            actor=actor, verb="pesquisou CadSUS",
            extra=f"{' · '.join(search_summary) or '(sem critério)'} · {len(items)} resultado(s)",
        ),
        details={"criteria": search_summary, "results": len(items), "source": "pdq"},
    )

    return CadsusSearchResponse(items=items, source="pdq")


@router.post("/patients", response_model=PatientRead, status_code=201)
async def create_patient(
    payload: PatientCreate,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.create"),
) -> PatientRead:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    patient = await svc.create_patient(payload)
    docs = await svc.list_documents(patient.id)
    return _patient_to_read(patient, docs)


# ── Detail / Update / Delete ───────────────────────────────────────────────

@router.get("/patients/{patient_id}", response_model=PatientRead)
async def get_patient(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.view"),
) -> PatientRead:
    svc = PatientService(db, ctx)
    patient = await svc.get_patient(patient_id)
    docs = await svc.list_documents(patient_id)
    await write_audit(
        db, module="hsp", action="patient_view", severity="info",
        resource="patient", resource_id=str(patient.id),
        description=describe_change(
            actor=get_audit_context().user_name,
            verb="consultou o prontuário de",
            target_name=patient.name,
        ),
        details={"patientName": patient.name, "prontuario": patient.prontuario},
    )
    return _patient_to_read(patient, docs)


@router.patch("/patients/{patient_id}", response_model=PatientRead)
async def update_patient(
    patient_id: UUID,
    payload: PatientUpdate,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.edit"),
) -> PatientRead:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    patient = await svc.update_patient(patient_id, payload)
    docs = await svc.list_documents(patient.id)
    return _patient_to_read(patient, docs)


@router.delete("/patients/{patient_id}", status_code=204)
async def delete_patient(
    patient_id: UUID,
    db: DB,
    reason: str | None = Query(default=None, max_length=500),
    ctx: WorkContext = requires(permission="hsp.patient.delete"),
) -> Response:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    await svc.deactivate_patient(patient_id, reason)
    return Response(status_code=204)


@router.post("/patients/{patient_id}/restore", response_model=PatientRead)
async def restore_patient(
    patient_id: UUID,
    db: DB,
    reason: str | None = Query(default=None, max_length=500),
    ctx: WorkContext = requires(permission="hsp.patient.delete"),
) -> PatientRead:
    """Reativa um paciente previamente desativado."""
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    patient = await svc.reactivate_patient(patient_id, reason)
    docs = await svc.list_documents(patient.id)
    return _patient_to_read(patient, docs)


# ── Foto ──────────────────────────────────────────────────────────────────

@router.post("/patients/{patient_id}/photo", response_model=PatientRead, status_code=201)
async def upload_patient_photo(
    patient_id: UUID,
    db: DB,
    file: Annotated[UploadFile, File(description="Imagem JPEG/PNG/WEBP até 10MB")],
    width: Annotated[int | None, Form()] = None,
    height: Annotated[int | None, Form()] = None,
    ctx: WorkContext = requires(permission="hsp.patient_photo.upload"),
) -> PatientRead:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw) > _MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande (máx. {_MAX_PHOTO_BYTES // (1024 * 1024)} MB).",
        )
    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_MIMES:
        raise HTTPException(status_code=415, detail="Formato não suportado. Use JPEG, PNG ou WEBP.")

    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    photo = await svc.set_photo(
        patient_id,
        content=raw,
        mime_type=mime,
        original_name=file.filename or "",
        width=width,
        height=height,
    )
    patient = await svc.get_patient(patient_id)
    docs = await svc.list_documents(patient_id)
    read = _patient_to_read(patient, docs)
    # Status do enrollment facial automático vai num campo transiente
    # pra UI poder mostrar aviso quando não houver rosto detectado.
    read.face_enrollment_status = getattr(photo, "face_status", None)
    return read


@router.get("/patients/{patient_id}/photo")
async def get_current_photo(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.view"),
) -> Response:
    svc = PatientService(db, ctx)
    photo = await svc.get_photo(patient_id, None)
    data = await load_photo_bytes(db, photo)
    patient_name = await _patient_name(db, patient_id)
    await write_audit(
        db, module="hsp", action="patient_photo_download", severity="info",
        resource="patient_photo", resource_id=str(photo.id),
        description=describe_change(
            actor=get_audit_context().user_name,
            verb="baixou a foto de",
            target_name=patient_name,
            extra="foto atual",
        ),
        details={"patientName": patient_name, "photoId": str(photo.id), "size": len(data)},
    )
    return Response(
        content=data,
        media_type=photo.mime_type,
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.get("/patients/{patient_id}/photos", response_model=list[PatientPhotoOut])
async def list_patient_photos(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.view"),
) -> list[PatientPhotoOut]:
    """Lista todas as fotos já enviadas pro paciente, da mais recente."""
    svc = PatientService(db, ctx)
    rows = await svc.list_photos(patient_id)
    patient_name = await _patient_name(db, patient_id)
    await write_audit(
        db, module="hsp", action="patient_photos_list", severity="info",
        resource="patient", resource_id=str(patient_id),
        description=describe_change(
            actor=get_audit_context().user_name,
            verb="listou as fotos de",
            target_name=patient_name,
            extra=f"{len(rows)} foto(s)",
        ),
        details={"patientName": patient_name, "count": len(rows)},
    )
    return [PatientPhotoOut.model_validate(p, from_attributes=True) for p in rows]


@router.get("/patients/{patient_id}/photos/{photo_id}")
async def get_specific_photo(
    patient_id: UUID,
    photo_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.view"),
) -> Response:
    svc = PatientService(db, ctx)
    photo = await svc.get_photo(patient_id, photo_id)
    data = await load_photo_bytes(db, photo)
    patient_name = await _patient_name(db, patient_id)
    await write_audit(
        db, module="hsp", action="patient_photo_download", severity="info",
        resource="patient_photo", resource_id=str(photo.id),
        description=describe_change(
            actor=get_audit_context().user_name,
            verb="baixou foto antiga de",
            target_name=patient_name,
        ),
        details={"patientName": patient_name, "photoId": str(photo.id), "size": len(data)},
    )
    return Response(
        content=data,
        media_type=photo.mime_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post("/patients/{patient_id}/photos/{photo_id}/restore", response_model=PatientRead)
async def restore_patient_photo(
    patient_id: UUID,
    photo_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.upload"),
) -> PatientRead:
    """Define uma foto antiga como a atual do paciente."""
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    await svc.restore_photo(patient_id, photo_id)
    patient = await svc.get_patient(patient_id)
    docs = await svc.list_documents(patient_id)
    return _patient_to_read(patient, docs)


@router.delete("/patients/{patient_id}/photo", status_code=204)
async def remove_patient_photo(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.upload"),
) -> Response:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    await svc.remove_photo(patient_id)
    return Response(status_code=204)


# ── Revisão de identidade ────────────────────────────────────────────────

@router.post("/patients/{patient_id}/identity-review/clear", status_code=204)
async def clear_identity_review(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.edit"),
) -> Response:
    """Recepção limpa o flag de revisão após checar/ajustar as fotos."""
    patient = await db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    was_needed = patient.identity_review_needed
    patient.identity_review_needed = False
    patient.identity_review_reason = None
    patient.identity_review_at = None
    await db.flush()
    if was_needed:
        patient_name = await _patient_name(db, patient_id)
        await write_audit(
            db, module="hsp", action="identity_review_clear", severity="info",
            resource="patient", resource_id=str(patient_id),
            description=describe_change(
                actor=get_audit_context().user_name,
                verb="validou a identidade de",
                target_name=patient_name,
            ),
            details={"patientName": patient_name},
        )
    return Response(status_code=204)


@router.patch("/patients/{patient_id}/photos/{photo_id}/flag", status_code=204)
async def set_photo_flag(
    patient_id: UUID,
    photo_id: UUID,
    flagged: bool,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.upload"),
) -> Response:
    """Marca/desmarca uma foto como suspeita. Útil pra recepção
    reclassificar uma foto que foi flagada por engano."""
    from app.tenant_models.patients import PatientPhoto
    photo = await db.get(PatientPhoto, photo_id)
    if photo is None or photo.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Foto não encontrada.")
    photo.flagged = flagged
    await db.flush()
    return Response(status_code=204)


# ── Endereços secundários ────────────────────────────────────────────────

@router.get("/patients/{patient_id}/addresses", response_model=list[PatientAddressOut])
async def list_patient_addresses(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.view"),
) -> list[PatientAddressOut]:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    rows = await svc.list_addresses(patient_id)
    return [PatientAddressOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/patients/{patient_id}/addresses", response_model=PatientAddressOut, status_code=201)
async def create_patient_address(
    patient_id: UUID,
    payload: PatientAddressInput,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.edit"),
) -> PatientAddressOut:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    addr = await svc.create_address(patient_id, payload)
    return PatientAddressOut.model_validate(addr, from_attributes=True)


@router.patch("/patients/{patient_id}/addresses/{address_id}", response_model=PatientAddressOut)
async def update_patient_address(
    patient_id: UUID,
    address_id: UUID,
    payload: PatientAddressInput,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.edit"),
) -> PatientAddressOut:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    addr = await svc.update_address(patient_id, address_id, payload)
    return PatientAddressOut.model_validate(addr, from_attributes=True)


@router.delete("/patients/{patient_id}/addresses/{address_id}", status_code=204)
async def delete_patient_address(
    patient_id: UUID,
    address_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.edit"),
) -> Response:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    await svc.delete_address(patient_id, address_id)
    return Response(status_code=204)


# ── Histórico ────────────────────────────────────────────────────────────

@router.get("/patients/{patient_id}/history", response_model=Page[PatientFieldHistoryOut])
async def list_patient_history(
    patient_id: UUID,
    db: DB,
    field: str | None = Query(default=None, max_length=80),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    ctx: WorkContext = requires(permission="hsp.patient_history.view"),
) -> Page[PatientFieldHistoryOut]:
    svc = PatientService(db, ctx)
    rows, total = await svc.list_history(patient_id, field=field, page=page, page_size=page_size)
    patient_name = await _patient_name(db, patient_id)
    extra = f"{total} entrada(s)" + (f" · campo {field}" if field else "")
    await write_audit(
        db, module="hsp", action="patient_history_view", severity="info",
        resource="patient", resource_id=str(patient_id),
        description=describe_change(
            actor=get_audit_context().user_name,
            verb="consultou o histórico de",
            target_name=patient_name,
            extra=extra,
        ),
        details={"patientName": patient_name, "field": field or "", "total": total},
    )
    return Page(
        items=[PatientFieldHistoryOut.model_validate(r, from_attributes=True) for r in rows],
        total=total, page=page, page_size=page_size,
    )
