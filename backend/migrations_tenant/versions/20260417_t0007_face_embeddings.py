"""Tabela patient_face_embeddings (reconhecimento facial local).

Revision ID: t0007_face_embeddings
Revises: t0006_patient_lat_lng
Create Date: 2026-04-17

Embedding facial gerado por InsightFace (ArcFace buffalo_l, 512-dim).
Um embedding ativo por paciente (UNIQUE patient_id). Índice HNSW com
``vector_cosine_ops`` pra busca sub-10ms em até 100k pacientes.

Requer:
- pgvector >= 0.5 (HNSW) — imagem ``pgvector/pgvector:pg17``.
- Migration app ``0023_pgvector_extension`` aplicada antes desta.

**Portabilidade**: esta migration é **Postgres-only** — usa o tipo
``vector(512)`` e índice HNSW, que não existem em Oracle. Em Oracle o
schema tenant é provisionado via ``metadata.create_all`` (ver
``app/db/tenant_schemas.py``), que usa ``VectorType`` (fallback ``BLOB``).
O módulo de reconhecimento facial requer Postgres em runtime.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "t0007_face_embeddings"
down_revision: str | None = "t0006_patient_lat_lng"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Tabela (schema tenant — via search_path). A extensão `vector` vive em
    # public e está acessível graças ao search_path `mun_xxx, app, public`.
    op.execute(
        """
        CREATE TABLE patient_face_embeddings (
            id UUID PRIMARY KEY,
            patient_id UUID NOT NULL,
            photo_id UUID,
            embedding vector(512) NOT NULL,
            detection_score REAL NOT NULL,
            bbox JSONB,
            algorithm VARCHAR(40) NOT NULL DEFAULT 'insightface/buffalo_l',
            algorithm_version VARCHAR(20) NOT NULL DEFAULT 'v1',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_patient_face_embeddings_patient_id UNIQUE (patient_id),
            CONSTRAINT fk_patient_face_embeddings_patient_id_patients
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            CONSTRAINT fk_patient_face_embeddings_photo_id_patient_photos
                FOREIGN KEY (photo_id) REFERENCES patient_photos(id) ON DELETE SET NULL
        );
        """
    )
    op.execute(
        "CREATE INDEX ix_patient_face_embeddings_patient_id "
        "ON patient_face_embeddings (patient_id);"
    )
    # HNSW pra cosine distance. Parâmetros default adequados pra 10k-100k
    # pacientes. Ajustar `m` e `ef_construction` se a base crescer muito.
    op.execute(
        "CREATE INDEX ix_pfe_embedding_hnsw ON patient_face_embeddings "
        "USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS patient_face_embeddings CASCADE;")
    _ = (sa, postgresql)  # evita lint de unused
