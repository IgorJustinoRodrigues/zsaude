"""Tabela files no schema app (catálogo global de arquivos no object storage).

Revision ID: 0028_files_table
Revises: 0027_municipality_databases
Create Date: 2026-04-17

Catálogo de arquivos globais (logos, templates, exports, imports). Arquivos
por município ficam em ``mun_<ibge>.files`` (ver migration tenant t0008).
Usa tipos portáteis (``UUIDType``) para funcionar em Postgres e Oracle.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0028_files_table"
down_revision: str | None = "0027_municipality_databases"
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
        sa.UniqueConstraint("storage_key", name="uq_app_files_storage_key"),
        schema="app",
    )
    op.create_index("ix_app_files_category", "files", ["category"], schema="app")
    op.create_index("ix_app_files_entity_id", "files", ["entity_id"], schema="app")


def downgrade() -> None:
    op.drop_index("ix_app_files_entity_id", table_name="files", schema="app")
    op.drop_index("ix_app_files_category", table_name="files", schema="app")
    op.drop_table("files", schema="app")
