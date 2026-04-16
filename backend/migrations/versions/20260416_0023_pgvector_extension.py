"""Instala extensão pgvector no schema public

Revision ID: 0023_pgvector_extension
Revises: 0022_ai_default_routes
Create Date: 2026-04-16

O tipo ``vector`` precisa existir no search_path de todos os schemas tenant
— instalar em ``public`` resolve isso naturalmente (já está no search_path
de cada município).

Requer a imagem ``pgvector/pgvector:pg17`` no docker-compose.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0023_pgvector_extension"
down_revision: str | None = "0022_ai_default_routes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    # NÃO remove — pode haver outras tabelas dependendo (patient_face_embeddings
    # etc). Remoção manual fica por conta do operador se realmente precisar.
    pass
