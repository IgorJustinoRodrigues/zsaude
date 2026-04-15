"""Módulo DGN — Diagnóstico. Stub inicial pra demonstrar RBAC."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import DB, WorkContext, requires
from app.core.schema_base import CamelModel

router = APIRouter(prefix="/dgn", tags=["dgn"])


class ExamStub(CamelModel):
    id: str
    patient_name: str
    exam_name: str
    status: str


_STUB_EXAMS: list[ExamStub] = [
    ExamStub(id="e1", patient_name="Ana Beatriz Costa",   exam_name="Hemograma Completo", status="Solicitado"),
    ExamStub(id="e2", patient_name="Bruno Rocha",         exam_name="Glicemia em Jejum",  status="Coletado"),
    ExamStub(id="e3", patient_name="Carlos Eduardo Mota", exam_name="Troponina I",        status="Em Análise"),
]


@router.get("/exams", response_model=list[ExamStub])
async def list_exams(
    db: DB,
    ctx: WorkContext = requires(permission="dgn.exam.view"),
) -> list[ExamStub]:
    """Lista solicitações de exame. Gated por ``dgn.exam.view``."""
    return _STUB_EXAMS


@router.post("/exams", response_model=ExamStub, status_code=201)
async def request_exam(
    db: DB,
    ctx: WorkContext = requires(permission="dgn.exam.request"),
) -> ExamStub:
    """Solicita exame. Gated por ``dgn.exam.request``."""
    return ExamStub(id="e4", patient_name="Novo paciente", exam_name="Creatinina", status="Solicitado")
