"""Foto e embedding facial do usuário — schema ``app`` (global).

Separado dos modelos de paciente (``mun_<ibge>.patient_photos`` /
``patient_face_embeddings``) para evitar match cruzado entre paciente
e funcionário e permitir busca global por usuário (login, totem, ponto).

Padrão idêntico ao de paciente: uma linha por upload em
``user_photos``, foto ativa apontada por ``users.current_photo_id``,
embedding UNIQUE por ``user_id`` em ``user_face_embeddings``.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import JSONType, UUIDType, VectorType, new_uuid7


class UserPhoto(Base):
    """Uma linha por upload de foto do usuário.

    A foto ativa é apontada por ``users.current_photo_id``. Fotos
    antigas ficam para rastreabilidade e recuperação (restore).
    """

    __tablename__ = "user_photos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), primary_key=True, default=new_uuid7
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("files.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # storage_key desnormalizado — evita JOIN em downloads (hot path).
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False, server_default=" ")

    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)
    uploaded_by_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )


class UserFaceEmbedding(Base):
    """Embedding facial ativo do usuário. Um por usuário (UNIQUE)."""

    __tablename__ = "user_face_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), primary_key=True, default=new_uuid7
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("user_photos.id", ondelete="SET NULL"),
        nullable=True,
    )

    embedding: Mapped[list[float]] = mapped_column(VectorType(512), nullable=False)
    detection_score: Mapped[float] = mapped_column(Float, nullable=False)
    bbox: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)

    algorithm: Mapped[str] = mapped_column(
        String(40), nullable=False, server_default="insightface/buffalo_l"
    )
    algorithm_version: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="v1"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP"),
    )
