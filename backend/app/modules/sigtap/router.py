"""Endpoints de importação SIGTAP (MASTER only, escopo global)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import desc, select

from app.core.audit import get_audit_context
from app.core.deps import DB, MasterDep
from app.core.exceptions import AppError
from app.modules.audit.writer import write_audit
from app.modules.sigtap.models import SigtapImport, SigtapImportFile
from app.modules.sigtap.schemas import (
    SigtapImportDetailOut,
    SigtapImportFileOut,
    SigtapImportOut,
)
from app.modules.sigtap.service import SigtapImportService

router = APIRouter(prefix="/sigtap", tags=["sigtap"])

_MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB — pacote SIGTAP tem ~400k linhas


@router.post("/import", response_model=SigtapImportDetailOut, status_code=201)
async def import_sigtap(
    file: Annotated[UploadFile, File(description="Pacote ZIP do DATASUS (TabelaUnificada_AAAAMM_vXXXXX.zip)")],
    db: DB,
    user: MasterDep,
) -> SigtapImportDetailOut:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande (máx. {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
        )

    # Nome do usuário para snapshot no histórico.
    from app.modules.users.models import User
    user_record = await db.scalar(select(User).where(User.id == user.id))

    svc = SigtapImportService(
        db,
        user_id=user.id,
        user_name=user_record.name if user_record else "",
    )

    try:
        import_row = await svc.import_zip(raw, file.filename or "arquivo.zip")
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha na importação: {exc}") from exc

    actor = get_audit_context().user_name or "Sistema"
    await write_audit(
        db,
        module="sys", action="sigtap_import", severity="info",
        resource="sigtap_import", resource_id=str(import_row.id),
        description=(
            f"{actor} importou a tabela SIGTAP da competência "
            f"{import_row.competencia} ({import_row.total_rows_processed} linhas · "
            f"status: {import_row.status.value})"
        ),
        details={
            "competencia": import_row.competencia,
            "status": import_row.status.value,
            "totalRows": import_row.total_rows_processed,
            "zipFilename": import_row.zip_filename,
        },
    )

    return await _load_detail(db, import_row.id)


@router.get("/imports", response_model=list[SigtapImportOut])
async def list_imports(
    db: DB,
    user: MasterDep,
    limit: int = 50,
) -> list[SigtapImportOut]:
    rows = list((await db.scalars(
        select(SigtapImport).order_by(desc(SigtapImport.started_at)).limit(limit)
    )).all())
    return [
        SigtapImportOut(
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


@router.get("/imports/{import_id}", response_model=SigtapImportDetailOut)
async def get_import(
    import_id: UUID,
    db: DB,
    user: MasterDep,
) -> SigtapImportDetailOut:
    return await _load_detail(db, import_id)


async def _load_detail(db, import_id: UUID) -> SigtapImportDetailOut:
    import_row = await db.scalar(select(SigtapImport).where(SigtapImport.id == import_id))
    if import_row is None:
        raise HTTPException(status_code=404, detail="Importação não encontrada.")
    files = list((await db.scalars(
        select(SigtapImportFile)
        .where(SigtapImportFile.import_id == import_id)
        .order_by(SigtapImportFile.filename)
    )).all())
    return SigtapImportDetailOut(
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
            SigtapImportFileOut(
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
