"""Embeddings faciais do paciente — vive em cada schema `mun_<ibge>`.

Um embedding ativo por paciente (UNIQUE ``patient_id``). Gerado pelo
InsightFace (ArcFace ``buffalo_l``, 512 floats). Busca por similaridade
cosseno via índice HNSW.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import new_uuid7
from app.tenant_models import TenantBase


class PatientFaceEmbedding(TenantBase):
    __tablename__ = "patient_face_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)

    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Foto que originou o embedding. `SET NULL` na delete do photo pra não
    # perder o embedding — o service pode decidir (ex: recalcular se houver
    # foto nova, remover se fotos vazias).
    photo_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patient_photos.id", ondelete="SET NULL"),
        nullable=True,
    )

    embedding: Mapped[list[float]] = mapped_column(Vector(512), nullable=False)

    detection_score: Mapped[float] = mapped_column(Float, nullable=False)
    bbox: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Metadata do pipeline — permite regenerar ao trocar modelo/versão.
    algorithm: Mapped[str] = mapped_column(String(40), nullable=False, server_default="insightface/buffalo_l")
    algorithm_version: Mapped[str] = mapped_column(String(20), nullable=False, server_default="v1")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"),
    )
