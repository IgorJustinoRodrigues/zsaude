"""Modelo `files` reutilizável para App e Tenant schemas.

Catálogo de arquivos armazenados no object storage (S3/MinIO).
Cada schema (app e mun_<ibge>) tem sua própria tabela `files`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import UUIDType, new_uuid7
from app.tenant_models import TenantBase


class AppFile(Base, TimestampedMixin):
    """Arquivos globais (logos, templates, exports) no schema app."""

    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    original_name: Mapped[str] = mapped_column(String(300), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True, index=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    uploaded_by_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")


class TenantFile(TenantBase, TimestampedMixin):
    """Arquivos por município (fotos, documentos, imports) no schema mun_<ibge>."""

    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    original_name: Mapped[str] = mapped_column(String(300), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True, index=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    uploaded_by_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
