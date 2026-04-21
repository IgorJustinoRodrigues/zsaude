"""Endpoints de reconhecimento facial (HSP).

- ``POST /hsp/patients/match-face`` — envia imagem, recebe top-N candidatos.
- ``DELETE /hsp/patients/{id}/face-embedding`` — opt-out (remove embedding).
- ``POST /hsp/admin/face/reindex`` — backfill administrativo.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import Field

from sqlalchemy import select

from app.core.audit import get_audit_context
from app.core.schema_base import CamelModel
from app.core.deps import DB, MasterDep, WorkContext, requires
from app.modules.audit.helpers import describe_change
from app.modules.audit.writer import write_audit
from app.modules.hsp import face_service
from app.tenant_models.patients import Patient


router = APIRouter(prefix="/hsp", tags=["hsp-face"])


_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}


# ─── Schemas ─────────────────────────────────────────────────────────────────


class MatchCandidateOut(CamelModel):
    patient_id: UUID
    name: str
    social_name: str
    cpf_masked: str | None
    birth_date: str | None
    similarity: float
    has_photo: bool


class MatchDetectionOut(CamelModel):
    score: float
    bbox: dict[str, float]
    face_count: int


class MatchResponse(CamelModel):
    candidates: list[MatchCandidateOut]
    detection: MatchDetectionOut


class ReindexResponse(CamelModel):
    total: int
    enrolled: int
    no_face: int
    errors: int


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _mask_cpf(cpf: str | None) -> str | None:
    """Retorna CPF mascarado ex: ``***.***.***-12``."""
    if not cpf:
        return None
    digits = "".join(c for c in cpf if c.isdigit())
    if len(digits) != 11:
        return cpf
    return f"***.***.***-{digits[-2:]}"


async def _resolve_patient_name(db, patient_id: UUID) -> str:
    """Resolve ``patient_id`` → ``patient.name`` pra audit legível."""
    name = await db.scalar(select(Patient.name).where(Patient.id == patient_id))
    return name or "(desconhecido)"


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.post("/patients/match-face", response_model=MatchResponse)
async def match_face(
    db: DB,
    file: Annotated[UploadFile, File(description="Imagem JPEG/PNG/WEBP")],
    ctx: WorkContext = requires(permission="hsp.patient.face_match"),
) -> MatchResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máx. 10 MB).")
    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_MIMES:
        raise HTTPException(status_code=415, detail="Formato não suportado.")

    try:
        resp = await face_service.match(db, image_bytes=raw)
    except face_service.FaceError as e:
        # Mapeia erros de negócio pra 422 (sem rosto / baixa qualidade).
        raise HTTPException(status_code=422, detail={"code": e.code, "message": str(e)}) from e

    # Audit humano: quem consultou, quantos bateram, nome do melhor match.
    best = resp.candidates[0] if resp.candidates else None
    best_name = best.name if best else ""
    best_sim = best.similarity if best else 0.0
    user_name = get_audit_context().user_name

    if best:
        extra = f"{len(resp.candidates)} candidatos, melhor: {best_name} ({best_sim:.0%})"
    else:
        extra = "nenhum candidato encontrado"

    await write_audit(
        db,
        module="hsp",
        action="face_match",
        severity="info",
        resource="patient",
        resource_id=str(best.patient_id) if best else "",
        description=describe_change(
            actor=user_name,
            verb="consultou reconhecimento facial",
            extra=extra,
        ),
        details={
            "candidatesCount": len(resp.candidates),
            "bestMatchName": best_name,
            "bestSimilarity": round(best_sim, 4),
            "detectionScore": round(resp.detection["score"], 4),
        },
    )

    return MatchResponse(
        candidates=[
            MatchCandidateOut(
                patient_id=c.patient_id,
                name=c.name,
                social_name=c.social_name,
                cpf_masked=_mask_cpf(c.cpf),
                birth_date=c.birth_date,
                similarity=c.similarity,
                has_photo=c.has_photo,
            )
            for c in resp.candidates
        ],
        detection=MatchDetectionOut(
            score=resp.detection["score"],
            bbox=resp.detection["bbox"],
            face_count=resp.detection["face_count"],
        ),
    )


@router.delete("/patients/{patient_id}/face-embedding", status_code=204)
async def delete_face_embedding(
    patient_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="hsp.patient.edit"),
) -> None:
    """Opt-out: remove o embedding facial do paciente. Idempotente."""
    removed = await face_service.delete_embedding(db, patient_id)
    if removed:
        patient_name = await _resolve_patient_name(db, patient_id)
        user_name = get_audit_context().user_name
        await write_audit(
            db,
            module="hsp",
            action="face_embedding_delete",
            severity="info",
            resource="patient",
            resource_id=str(patient_id),
            description=describe_change(
                actor=user_name,
                verb="removeu o reconhecimento facial",
                target_kind="paciente",
                target_name=patient_name,
            ),
            details={"patientName": patient_name},
        )


# ── Admin ────────────────────────────────────────────────────────────────────


class ReindexRequest(CamelModel):
    force: bool = Field(default=False)


@router.post("/admin/face/reindex", response_model=ReindexResponse)
async def reindex_face_embeddings(
    payload: ReindexRequest,
    db: DB,
    _: MasterDep,
    ctx: WorkContext = requires(permission="hsp.face.reindex"),
) -> ReindexResponse:
    """Regenera embeddings dos pacientes com foto ativa no município ativo.

    Requer MASTER + permissão ``hsp.face.reindex``. Operação síncrona — pode
    levar alguns minutos em municípios grandes. Futuramente virá via job.
    """
    status = await face_service.reindex_all(db, force=payload.force)
    user_name = get_audit_context().user_name
    extra = (
        f"{status.enrolled} de {status.total} pacientes reindexados · "
        f"{status.no_face} sem rosto · {status.errors} erro(s)"
    )
    await write_audit(
        db,
        module="hsp",
        action="face_reindex",
        severity="info",
        resource="face_index",
        resource_id="",
        description=describe_change(
            actor=user_name,
            verb="reindexou o reconhecimento facial do município",
            extra=extra,
        ),
        details={
            "total": status.total,
            "enrolled": status.enrolled,
            "noFace": status.no_face,
            "errors": status.errors,
            "force": payload.force,
        },
    )
    return ReindexResponse(
        total=status.total,
        enrolled=status.enrolled,
        no_face=status.no_face,
        errors=status.errors,
    )
