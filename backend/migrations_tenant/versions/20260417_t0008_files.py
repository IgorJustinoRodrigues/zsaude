"""Tabela files + integração com patient_photos (object storage).

Revision ID: t0008_files
Revises: t0007_face_embeddings
Create Date: 2026-04-17

Feature: fotos e arquivos passam a viver em S3/MinIO. Esta migration:

- Cria a tabela ``files`` (catálogo por município).
- Adiciona ``patient_photos.file_id`` (FK → files.id).
- Relaxa ``patient_photos.content`` para NULL (fotos novas ficam no S3;
  fotos antigas mantêm content até eventual backfill).

Portabilidade: usa ``UUIDType`` (PG UUID / Oracle RAW(16) / fallback CHAR(36))
e tipos SQLAlchemy padrão — roda em Postgres via Alembic e em Oracle via
``metadata.create_all`` (ver app/db/tenant_schemas.py).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "t0008_files"
down_revision: str | None = "t0007_face_embeddings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "files",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("original_name", sa.String(300), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("entity_id", UUIDType(), nullable=True),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("uploaded_by", UUIDType(), nullable=True),
        sa.Column("uploaded_by_name", sa.String(200), nullable=False),
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
        sa.UniqueConstraint("storage_key", name="uq_files_storage_key"),
    )
    op.create_index("ix_files_category", "files", ["category"])
    op.create_index("ix_files_entity_id", "files", ["entity_id"])

    op.add_column(
        "patient_photos",
        sa.Column("file_id", UUIDType(), nullable=True),
    )
    op.create_foreign_key(
        "fk_patient_photos_file_id_files",
        "patient_photos",
        "files",
        ["file_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_patient_photos_file_id", "patient_photos", ["file_id"]
    )
    op.alter_column(
        "patient_photos", "content", existing_type=sa.LargeBinary(), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "patient_photos", "content", existing_type=sa.LargeBinary(), nullable=False
    )
    op.drop_index("ix_patient_photos_file_id", table_name="patient_photos")
    op.drop_constraint(
        "fk_patient_photos_file_id_files", "patient_photos", type_="foreignkey"
    )
    op.drop_column("patient_photos", "file_id")
    op.drop_index("ix_files_entity_id", table_name="files")
    op.drop_index("ix_files_category", table_name="files")
    op.drop_table("files")
