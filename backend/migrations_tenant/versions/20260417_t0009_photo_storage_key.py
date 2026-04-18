"""Adiciona storage_key e file_id em patient_photos (migração para S3).

Revision ID: t0009_photo_storage_key
Revises: t0008_files_table
Create Date: 2026-04-17

A coluna content (BYTEA) passa a ser nullable — novos uploads vão
direto pro S3, fotos legadas mantêm o content até migração completa.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "t0009_photo_storage_key"
down_revision: str | None = "t0008_files_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("patient_photos", sa.Column("storage_key", sa.String(500), nullable=True))
    op.add_column("patient_photos", sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.alter_column("patient_photos", "content", existing_type=sa.LargeBinary(), nullable=True)


def downgrade() -> None:
    op.alter_column("patient_photos", "content", existing_type=sa.LargeBinary(), nullable=False)
    op.drop_column("patient_photos", "file_id")
    op.drop_column("patient_photos", "storage_key")
