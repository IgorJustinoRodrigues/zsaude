"""Modelo `files` reutilizável para App e Tenant schemas.

Catálogo de arquivos armazenados no object storage (S3/MinIO).
Cada schema (app e mun_<ibge>) tem sua própria tabela `files`.
"""

from __future__ import annotations

import uuid
from datetime import datetime  # noqa: F401 — usado por type hints nos mixins

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import UUIDType, new_uuid7
from app.tenant_models import TenantBase


class _FileColumns:
    """Colunas compartilhadas entre AppFile e TenantFile."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), primary_key=True, default=new_uuid7
    )
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_name: Mapped[str] = mapped_column(String(300), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(), nullable=True, index=True
    )
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    uploaded_by_name: Mapped[str] = mapped_column(String(200), nullable=False)


class AppFile(_FileColumns, Base, TimestampedMixin):
    """Arquivos globais (logos, templates, imports) no schema app."""

    __tablename__ = "files"
    __table_args__ = (
        UniqueConstraint("storage_key", name="uq_app_files_storage_key"),
    )


class TenantFile(_FileColumns, TenantBase, TimestampedMixin):
    """Arquivos por município (fotos, documentos, imports) no schema mun_<ibge>."""

    __tablename__ = "files"
    __table_args__ = (
        UniqueConstraint("storage_key", name="uq_files_storage_key"),
    )
