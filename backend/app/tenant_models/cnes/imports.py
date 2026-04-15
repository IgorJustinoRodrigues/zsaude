"""Histórico de importações CNES + log por arquivo."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import new_uuid7
from app.tenant_models import TenantBase


class CnesImportStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"  # concluiu mas com warnings


class CnesImport(TenantBase):
    """Registro de uma importação CNES — cabeçalho.

    ``uploaded_by_user_*`` é snapshot: se o usuário for deletado do ``app``
    schema, o histórico permanece. O ID continua útil para auditoria
    cross-reference (sem FK cross-schema).
    """

    __tablename__ = "cnes_imports"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)

    competencia: Mapped[str] = mapped_column(String(6), nullable=False, index=True)

    # snapshot do usuário (sem FK cross-schema — ver comentário do `created_by`
    # em tenant_models/patients.py).
    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    uploaded_by_user_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")

    zip_filename: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    zip_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    status: Mapped[CnesImportStatus] = mapped_column(
        Enum(
            CnesImportStatus,
            name="cnes_import_status",
            native_enum=False,
            length=10,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        server_default=CnesImportStatus.RUNNING.value,
        index=True,
    )

    error_message: Mapped[str] = mapped_column(String(2000), nullable=False, server_default="")

    total_rows_processed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )


class CnesImportFile(TenantBase):
    """Log por arquivo dentro de uma importação.

    Uma linha para cada LFCES processado. Warnings ficam em JSONB (lista
    de strings curtas; veja limitações em ``_MAX_WARNINGS_PER_FILE``).
    """

    __tablename__ = "cnes_import_files"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)

    import_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("cnes_imports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    filename: Mapped[str] = mapped_column(String(60), nullable=False)

    rows_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    rows_inserted: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    rows_updated: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    rows_skipped: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    warnings: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    error_message: Mapped[str] = mapped_column(String(2000), nullable=False, server_default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
