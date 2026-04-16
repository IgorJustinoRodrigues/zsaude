"""Endpoints HSP — cadastro de paciente (contexto município)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import select

from app.core.deps import DB, WorkContext, requires
from app.core.pagination import Page
from app.modules.hsp.schemas import (
    PatientCreate,
    PatientFieldHistoryOut,
    PatientListItem,
    PatientRead,
    PatientUpdate,
)
from app.modules.hsp.service import PatientService
from app.modules.users.models import User
from app.tenant_models.patients import Patient

router = APIRouter(prefix="/hsp", tags=["hsp"])

_MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}


async def _user_name(db, ctx: WorkContext) -> str:
    u = await db.scalar(select(User).where(User.id == ctx.user_id))
    return u.name if u else ""


def _patient_to_read(p: Patient) -> PatientRead:
    read = PatientRead.model_validate(p, from_attributes=True)
    read.has_photo = p.current_photo_id is not None
    # deficiencias é armazenado como list[str] (UUIDs em JSONB).
    read.deficiencias = [UUID(v) if isinstance(v, str) else v for v in (p.deficiencias or [])]
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
    return Page(items=[_patient_to_item(p) for p in rows], total=total,
                page=page, page_size=page_size)


@router.post("/patients", response_model=PatientRead, status_code=201)
async def create_patient(
    payload: PatientCreate,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.create"),
) -> PatientRead:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    patient = await svc.create_patient(payload)
    return _patient_to_read(patient)


# ── Detail / Update / Delete ───────────────────────────────────────────────

@router.get("/patients/{patient_id}", response_model=PatientRead)
async def get_patient(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.view"),
) -> PatientRead:
    svc = PatientService(db, ctx)
    patient = await svc.get_patient(patient_id)
    return _patient_to_read(patient)


@router.patch("/patients/{patient_id}", response_model=PatientRead)
async def update_patient(
    patient_id: UUID,
    payload: PatientUpdate,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.edit"),
) -> PatientRead:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    patient = await svc.update_patient(patient_id, payload)
    return _patient_to_read(patient)


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
    await svc.set_photo(patient_id, content=raw, mime_type=mime, width=width, height=height)
    patient = await svc.get_patient(patient_id)
    return _patient_to_read(patient)


@router.get("/patients/{patient_id}/photo")
async def get_current_photo(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.view"),
) -> Response:
    svc = PatientService(db, ctx)
    photo = await svc.get_photo(patient_id, None)
    return Response(
        content=bytes(photo.content),
        media_type=photo.mime_type,
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.get("/patients/{patient_id}/photos/{photo_id}")
async def get_specific_photo(
    patient_id: UUID,
    photo_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.view"),
) -> Response:
    svc = PatientService(db, ctx)
    photo = await svc.get_photo(patient_id, photo_id)
    return Response(
        content=bytes(photo.content),
        media_type=photo.mime_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/patients/{patient_id}/photo", status_code=204)
async def remove_patient_photo(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient_photo.upload"),
) -> Response:
    svc = PatientService(db, ctx, user_name=await _user_name(db, ctx))
    await svc.remove_photo(patient_id)
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
    return Page(
        items=[PatientFieldHistoryOut.model_validate(r, from_attributes=True) for r in rows],
        total=total, page=page, page_size=page_size,
    )
