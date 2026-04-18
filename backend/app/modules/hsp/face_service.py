"""Serviço de reconhecimento facial pro módulo HSP.

Funcionalidades:
- ``enroll_from_photo`` — gera embedding a partir dos bytes de uma foto
  recém-gravada e faz UPSERT em ``patient_face_embeddings``.
- ``match`` — dado uma imagem, busca top-5 candidatos por similaridade.
- ``reindex_all`` — regenera embeddings pra todos os pacientes com foto
  ativa (usado no backfill e quando troca de modelo).

Não usa gateway de IA. Tudo local via ``app.services.face``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dialect import get_adapter
from app.db.file_model import TenantFile
from app.modules.system.service import get_float_sync
from app.services.face import detect_and_embed
from app.services.face.schemas import FaceResult
from app.services.storage import get_storage
from app.tenant_models.face import PatientFaceEmbedding
from app.tenant_models.patients import Patient, PatientPhoto

log = logging.getLogger(__name__)


FaceStatus = Literal["ok", "no_face", "low_quality", "error", "disabled"]
"""Status devolvido ao caller quando uma foto é processada.

- ``ok`` — embedding gerado e salvo.
- ``no_face`` — foto decodificou mas nenhum rosto foi detectado.
- ``low_quality`` — rosto detectado, mas score < threshold.
- ``error`` — falha técnica (decode, modelo, etc).
- ``disabled`` — feature desligada globalmente.
"""


@dataclass
class MatchCandidate:
    patient_id: UUID
    name: str
    social_name: str
    cpf: str | None
    birth_date: str | None
    similarity: float       # cosine similarity 0..1
    has_photo: bool


@dataclass
class MatchResponse:
    candidates: list[MatchCandidate]
    detection: dict            # {score, bbox, face_count}


class FaceError(Exception):
    """Erro de negócio — mapeia pra 4xx no router."""

    def __init__(self, message: str, *, code: str = "face_error"):
        super().__init__(message)
        self.code = code


# ─── Config via system_settings ──────────────────────────────────────────────

def _match_threshold() -> float:
    """Similaridade mínima pra um candidato aparecer no top-5."""
    return get_float_sync("hsp.face.match_threshold", 0.40)


def _min_detection_score() -> float:
    """Score mínimo do detector pra aceitar um rosto (tanto enroll quanto match)."""
    return get_float_sync("hsp.face.min_detection_score", 0.50)


# ─── Enroll ──────────────────────────────────────────────────────────────────


def _is_vector_available(db: AsyncSession) -> bool:
    """Reconhecimento facial requer Postgres (pgvector) ou Oracle 23ai (AI Vector Search)."""
    try:
        return db.bind.dialect.name in ("postgresql", "oracle")
    except Exception:
        return False


async def enroll_from_photo(
    db: AsyncSession,
    *,
    patient_id: UUID,
    photo_bytes: bytes,
    photo_id: UUID,
) -> FaceStatus:
    """Gera embedding e faz UPSERT. NÃO faz flush (o caller controla a transação).

    Retorna o status pra UI mostrar aviso relevante. Nunca levanta exceção —
    falha não bloqueia o upload da foto.
    """
    if not _is_vector_available(db):
        return "disabled"

    # Nome do paciente pra aparecer em logs de erro (facilita triagem
    # sem precisar ir no banco buscar quem é o UUID).
    patient_name = await db.scalar(
        select(Patient.name).where(Patient.id == patient_id)
    ) or "(desconhecido)"

    try:
        result = await detect_and_embed(photo_bytes)
    except Exception as e:  # noqa: BLE001
        log.warning(
            "face_enroll_error",
            patient_name=patient_name, patient_id=str(patient_id),
            error=str(e),
        )
        return "error"

    if result is None:
        log.info(
            "face_enroll_no_face",
            patient_name=patient_name, patient_id=str(patient_id),
        )
        return "no_face"

    if result.detection_score < _min_detection_score():
        log.info(
            "face_enroll_low_quality",
            patient_name=patient_name, patient_id=str(patient_id),
            score=result.detection_score,
        )
        return "low_quality"

    adapter = get_adapter(db.bind.dialect.name)
    await adapter.execute_upsert(
        db,
        PatientFaceEmbedding,
        {
            "patient_id": patient_id,
            "photo_id": photo_id,
            "embedding": result.embedding,
            "detection_score": result.detection_score,
            "bbox": result.bbox,
            "algorithm": "insightface/buffalo_l",
            "algorithm_version": "v1",
        },
        index_elements=["patient_id"],
        update_columns=[
            "photo_id", "embedding", "detection_score", "bbox",
            "algorithm", "algorithm_version",
        ],
        extra_set={"updated_at": datetime.now(UTC)},
    )
    return "ok"


# ─── Match ───────────────────────────────────────────────────────────────────


async def match(
    db: AsyncSession,
    *,
    image_bytes: bytes,
    threshold: float | None = None,
    limit: int = 5,
) -> MatchResponse:
    """Busca top-N candidatos na base de embeddings do município ativo."""
    if not _is_vector_available(db):
        raise FaceError(
            "Reconhecimento facial não disponível neste banco de dados.",
            code="unsupported",
        )

    try:
        result = await detect_and_embed(image_bytes)
    except Exception as e:  # noqa: BLE001
        log.warning("face_match_error", error=str(e))
        raise FaceError("Falha ao processar imagem.", code="face_error") from e

    if result is None:
        raise FaceError("Nenhum rosto detectado na imagem.", code="no_face")

    if result.detection_score < _min_detection_score():
        raise FaceError(
            "Qualidade do rosto insuficiente. Reposicione a câmera.",
            code="low_quality",
        )

    thr = threshold if threshold is not None else _match_threshold()
    # Distância coseno: 0 = idêntico, 1 = ortogonal. similaridade = 1 - dist;
    # threshold de similaridade >= thr ⇔ distância <= 1 - thr.
    max_distance = 1 - thr

    adapter = get_adapter(db.bind.dialect.name)
    dist = adapter.vector_cosine_distance_sql("fe.embedding", "q")
    dialect = db.bind.dialect.name

    # Oracle não tem "IS TRUE" — patients.active é NUMBER(1). LIMIT também
    # varia: Postgres usa LIMIT, Oracle 12c+ usa FETCH FIRST N ROWS ONLY.
    active_cond = "p.active IS TRUE" if dialect == "postgresql" else "p.active = 1"
    has_photo_expr = (
        "(p.current_photo_id IS NOT NULL)" if dialect == "postgresql"
        else "CASE WHEN p.current_photo_id IS NOT NULL THEN 1 ELSE 0 END"
    )
    limit_clause = "LIMIT :lim" if dialect == "postgresql" else "FETCH FIRST :lim ROWS ONLY"

    sql = f"""
        SELECT
            p.id,
            p.name,
            p.social_name,
            p.cpf,
            p.birth_date,
            {has_photo_expr} AS has_photo,
            1 - ({dist}) AS similarity
        FROM patient_face_embeddings fe
        JOIN patients p ON p.id = fe.patient_id
        WHERE {active_cond}
          AND ({dist}) <= :max_dist
        ORDER BY ({dist}) ASC
        {limit_clause}
    """

    # Postgres (pgvector) aceita o vetor como string serializada; Oracle
    # (AI Vector Search) exige ``array.array("f", ...)`` — ``list`` Python
    # crua vira array PL/SQL e dispara ORA-01484.
    if dialect == "postgresql":
        q_param = str(result.embedding)
    else:
        import array as _array
        q_param = _array.array("f", result.embedding)

    rows = await db.execute(
        text(sql),
        {"q": q_param, "max_dist": max_distance, "lim": limit},
    )

    candidates: list[MatchCandidate] = []
    for row in rows.mappings():
        candidates.append(MatchCandidate(
            patient_id=row["id"],
            name=row["name"] or "",
            social_name=row["social_name"] or "",
            cpf=row["cpf"],
            birth_date=row["birth_date"].isoformat() if row["birth_date"] else None,
            similarity=float(row["similarity"]),
            has_photo=bool(row["has_photo"]),
        ))

    return MatchResponse(
        candidates=candidates,
        detection={
            "score": result.detection_score,
            "bbox": result.bbox,
            "face_count": result.face_count,
        },
    )


# ─── Remoção (opt-out) ───────────────────────────────────────────────────────


async def delete_embedding(db: AsyncSession, patient_id: UUID) -> bool:
    """Remove o embedding do paciente. Idempotente."""
    row = await db.scalar(
        select(PatientFaceEmbedding).where(PatientFaceEmbedding.patient_id == patient_id),
    )
    if row is None:
        return False
    await db.delete(row)
    return True


# ─── Backfill / reindex ──────────────────────────────────────────────────────


@dataclass
class ReindexStatus:
    total: int
    enrolled: int
    no_face: int
    errors: int


async def reindex_all(
    db: AsyncSession,
    *,
    force: bool = False,
    batch_size: int = 50,
) -> ReindexStatus:
    """Regenera embeddings pra todos os pacientes com foto ativa.

    Com ``force=False``, pula pacientes que já têm embedding da mesma
    algorithm_version (útil ao re-rodar após falhas).
    """
    stmt = (
        select(
            Patient.id,
            Patient.current_photo_id,
            TenantFile.storage_key,
            PatientPhoto.content,
        )
        .join(PatientPhoto, PatientPhoto.id == Patient.current_photo_id)
        .outerjoin(TenantFile, TenantFile.id == PatientPhoto.file_id)
        .where(Patient.current_photo_id.is_not(None), Patient.active == True)
    )
    rows = (await db.execute(stmt)).all()

    status = ReindexStatus(total=len(rows), enrolled=0, no_face=0, errors=0)

    if not force:
        existing = await db.execute(
            select(PatientFaceEmbedding.patient_id).where(
                PatientFaceEmbedding.algorithm_version == "v1",
            )
        )
        skip = {r[0] for r in existing.all()}
    else:
        skip = set()

    storage = get_storage()

    for i, (patient_id, photo_id, storage_key, content) in enumerate(rows):
        if patient_id in skip:
            continue
        if not photo_id:
            continue
        try:
            if storage_key:
                photo_bytes = await storage.download(storage_key)
            elif content:
                photo_bytes = bytes(content)
            else:
                continue
        except Exception:
            status.errors += 1
            continue
        try:
            result = await enroll_from_photo(
                db, patient_id=patient_id, photo_bytes=photo_bytes, photo_id=photo_id,
            )
            if result == "ok":
                status.enrolled += 1
            elif result == "no_face":
                status.no_face += 1
            else:
                status.errors += 1
        except Exception as e:  # noqa: BLE001
            patient_name = await db.scalar(
                select(Patient.name).where(Patient.id == patient_id)
            ) or "(desconhecido)"
            log.warning(
                "face_reindex_error",
                patient_name=patient_name, patient_id=str(patient_id),
                error=str(e),
            )
            status.errors += 1

        # Flush em batches pra não segurar transação gigante.
        if (i + 1) % batch_size == 0:
            await db.flush()

    await db.flush()
    return status
