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

from app.core.schema_base import CamelModel
from app.core.deps import DB, MasterDep, WorkContext, requires
from app.modules.audit.writer import write_audit
from app.modules.hsp import face_service


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

    # Audit: quem consultou, quantos bateram, melhor score.
    best = resp.candidates[0].similarity if resp.candidates else 0.0
    await write_audit(
        db,
        module="HSP",
        action="face_match",
        severity="info",
        resource="Patient",
        resource_id="",
        description=f"Face match consultado ({len(resp.candidates)} candidatos, melhor: {best:.3f})",
        details={
            "candidates": len(resp.candidates),
            "best_similarity": best,
            "detection_score": resp.detection["score"],
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
        await write_audit(
            db,
            module="HSP",
            action="face_embedding_delete",
            severity="info",
            resource="Patient",
            resource_id=str(patient_id),
            description="Embedding facial removido",
            details={},
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
    await write_audit(
        db,
        module="HSP",
        action="face_reindex",
        severity="info",
        resource="FaceIndex",
        resource_id="",
        description=(
            f"Reindex facial: {status.enrolled}/{status.total} ok, "
            f"{status.no_face} sem rosto, {status.errors} erros"
        ),
        details={
            "total": status.total,
            "enrolled": status.enrolled,
            "no_face": status.no_face,
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
