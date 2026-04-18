"""Foto e reconhecimento facial do usuário (schema app).

Revision ID: 0029_user_photos_and_face
Revises: 0028_files_table
Create Date: 2026-04-18

Adiciona:
- ``app.user_photos`` — catálogo de fotos por usuário (paralelo a
  ``patient_photos``, mas no schema global ``app``). A foto ativa é
  apontada por ``users.current_photo_id``.
- ``app.user_face_embeddings`` — embedding facial por usuário
  (UNIQUE ``user_id``). Separado dos embeddings de paciente (que vivem
  em ``mun_<ibge>.patient_face_embeddings``) para evitar match cruzado
  e permitir futura busca facial global (presença, totem, etc.).
- Colunas novas em ``app.users``:
  - ``current_photo_id`` — FK lógica para a foto ativa do usuário.
  - ``face_opt_in`` — opt-in/out de processamento biométrico. Default
    ``true`` (mesma convenção do paciente).

Usa tipos portáteis (UUIDType, VectorType, JSONType) — funciona em
Postgres + pgvector e Oracle 23ai + AI Vector Search.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType, UUIDType, VectorType

revision: str = "0029_user_photos_and_face"
down_revision: str | None = "0028_files_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── user_photos ─────────────────────────────────────────────────
    op.create_table(
        "user_photos",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "user_id",
            UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "file_id",
            UUIDType(),
            sa.ForeignKey("app.files.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("checksum_sha256", sa.String(64), nullable=False, server_default=" "),
        sa.Column("uploaded_by", UUIDType(), nullable=True),
        sa.Column("uploaded_by_name", sa.String(200), nullable=False, server_default=" "),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        schema="app",
    )
    op.create_index("ix_app_user_photos_user_id", "user_photos", ["user_id"], schema="app")
    op.create_index("ix_app_user_photos_file_id", "user_photos", ["file_id"], schema="app")

    # ── user_face_embeddings ────────────────────────────────────────
    op.create_table(
        "user_face_embeddings",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "user_id",
            UUIDType(),
            sa.ForeignKey("app.users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "photo_id",
            UUIDType(),
            sa.ForeignKey("app.user_photos.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("embedding", VectorType(512), nullable=False),
        sa.Column("detection_score", sa.Float(), nullable=False),
        sa.Column("bbox", JSONType(), nullable=True),
        sa.Column(
            "algorithm",
            sa.String(40),
            nullable=False,
            server_default="insightface/buffalo_l",
        ),
        sa.Column(
            "algorithm_version",
            sa.String(20),
            nullable=False,
            server_default="v1",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        schema="app",
    )

    # ── colunas novas em users ──────────────────────────────────────
    op.add_column(
        "users",
        sa.Column("current_photo_id", UUIDType(), nullable=True),
        schema="app",
    )
    op.add_column(
        "users",
        sa.Column(
            "face_opt_in",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("users", "face_opt_in", schema="app")
    op.drop_column("users", "current_photo_id", schema="app")
    op.drop_table("user_face_embeddings", schema="app")
    op.drop_index("ix_app_user_photos_file_id", table_name="user_photos", schema="app")
    op.drop_index("ix_app_user_photos_user_id", table_name="user_photos", schema="app")
    op.drop_table("user_photos", schema="app")
