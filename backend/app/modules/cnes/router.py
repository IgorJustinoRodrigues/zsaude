"""Endpoints de importação CNES (contexto município)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload

from app.core.audit import get_audit_context
from app.core.deps import DB, WorkContext, requires
from app.core.exceptions import AppError
from app.modules.audit.writer import write_audit
from app.modules.cnes.schemas import (
    CnesImportDetailOut,
    CnesImportFileOut,
    CnesImportOut,
)
from app.modules.cnes.service import CnesImportService
from app.tenant_models.cnes import CnesImport, CnesImportFile

router = APIRouter(prefix="/cnes", tags=["cnes"])

_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB — mais que suficiente para TXTPROC


@router.post("/import", response_model=CnesImportDetailOut, status_code=201)
async def import_cnes(
    file: Annotated[UploadFile, File(description="Pacote ZIP (TXTPROC_<ibge>_<aaaamm>.zip)")],
    db: DB,
    ctx: WorkContext = requires(permission="ops.import.execute"),
) -> CnesImportDetailOut:
    # Tamanho
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande (máx. {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
        )

    # Pega o nome do usuário pra snapshot no histórico.
    from app.modules.users.models import User
    user = await db.scalar(select(User).where(User.id == ctx.user_id))

    svc = CnesImportService(
        db,
        expected_ibge=ctx.municipality_ibge,
        user_id=ctx.user_id,
        user_name=user.name if user else "",
    )

    try:
        import_row = await svc.import_zip(raw, file.filename or "arquivo.zip")
    except AppError:
        # Service já lançou HTTPException-equivalente via AppError com status/code.
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha na importação: {exc}") from exc

    # Audit log global no schema `app`.
    actor = get_audit_context().user_name or "Sistema"
    await write_audit(
        db,
        module="ops", action="cnes_import", severity="info",
        resource="cnes_import", resource_id=str(import_row.id),
        description=(
            f"{actor} importou CNES da competência {import_row.competencia} "
            f"(município IBGE {ctx.municipality_ibge} · "
            f"{import_row.total_rows_processed} linhas · status: {import_row.status.value})"
        ),
        details={
            "ibge": ctx.municipality_ibge,
            "competencia": import_row.competencia,
            "status": import_row.status.value,
            "totalRows": import_row.total_rows_processed,
            "zipFilename": import_row.zip_filename,
        },
    )

    return await _load_detail(db, import_row.id)


@router.get("/imports", response_model=list[CnesImportOut])
async def list_imports(
    db: DB,
    ctx: WorkContext = requires(permission="ops.import.view"),
    limit: int = 50,
) -> list[CnesImportOut]:
    rows = list((await db.scalars(
        select(CnesImport).order_by(desc(CnesImport.started_at)).limit(limit)
    )).all())
    return [
        CnesImportOut(
            id=r.id,
            competencia=r.competencia,
            uploaded_by_user_id=r.uploaded_by_user_id,
            uploaded_by_user_name=r.uploaded_by_user_name,
            zip_filename=r.zip_filename,
            zip_size_bytes=r.zip_size_bytes,
            status=r.status.value if hasattr(r.status, "value") else str(r.status),
            error_message=r.error_message,
            total_rows_processed=r.total_rows_processed,
            started_at=r.started_at,
            finished_at=r.finished_at,
        )
        for r in rows
    ]


@router.get("/imports/{import_id}", response_model=CnesImportDetailOut)
async def get_import(
    import_id: UUID,
    db: DB,
    ctx: WorkContext = requires(permission="ops.import.view"),
) -> CnesImportDetailOut:
    return await _load_detail(db, import_id)


async def _load_detail(db, import_id: UUID) -> CnesImportDetailOut:
    import_row = await db.scalar(select(CnesImport).where(CnesImport.id == import_id))
    if import_row is None:
        raise HTTPException(status_code=404, detail="Importação não encontrada.")
    files = list((await db.scalars(
        select(CnesImportFile).where(CnesImportFile.import_id == import_id).order_by(CnesImportFile.filename)
    )).all())
    return CnesImportDetailOut(
        id=import_row.id,
        competencia=import_row.competencia,
        uploaded_by_user_id=import_row.uploaded_by_user_id,
        uploaded_by_user_name=import_row.uploaded_by_user_name,
        zip_filename=import_row.zip_filename,
        zip_size_bytes=import_row.zip_size_bytes,
        status=import_row.status.value if hasattr(import_row.status, "value") else str(import_row.status),
        error_message=import_row.error_message,
        total_rows_processed=import_row.total_rows_processed,
        started_at=import_row.started_at,
        finished_at=import_row.finished_at,
        files=[
            CnesImportFileOut(
                filename=f.filename,
                rows_total=f.rows_total,
                rows_inserted=f.rows_inserted,
                rows_updated=f.rows_updated,
                rows_skipped=f.rows_skipped,
                warnings=list(f.warnings or []),
                error_message=f.error_message,
            )
            for f in files
        ],
    )
