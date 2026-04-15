"""Schemas de I/O do módulo CNES."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.core.schema_base import CamelModel


class CnesImportFileOut(CamelModel):
    filename: str
    rows_total: int
    rows_inserted: int
    rows_updated: int
    rows_skipped: int
    warnings: list[str]
    error_message: str


class CnesImportOut(CamelModel):
    id: UUID
    competencia: str
    uploaded_by_user_id: UUID | None
    uploaded_by_user_name: str
    zip_filename: str
    zip_size_bytes: int
    status: str
    error_message: str
    total_rows_processed: int
    started_at: datetime
    finished_at: datetime | None


class CnesImportDetailOut(CnesImportOut):
    files: list[CnesImportFileOut]
