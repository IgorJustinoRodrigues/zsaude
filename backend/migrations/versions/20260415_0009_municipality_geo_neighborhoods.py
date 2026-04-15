"""Geolocalização de municípios + bairros

Revision ID: 0009_mun_geo_neighborhoods
Revises: 0008_rbac_finalize
Create Date: 2026-04-15

Adiciona em ``app.municipalities`` campos de demografia e território:
- ``population`` (int, null)
- ``center_latitude`` / ``center_longitude`` (numeric 10,7)
- ``territory`` (JSONB) — polígono simples `[[lat,lng], ...]`

Cria tabela ``app.neighborhoods``:
- id, municipality_id (FK), name
- population, latitude, longitude (todos opcionais)
- territory (JSONB) — polígono opcional
- uq (municipality_id, name)
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_mun_geo_neighborhoods"
down_revision: str | None = "0008_rbac_finalize"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("municipalities",
        sa.Column("population", sa.Integer(), nullable=True),
        schema="app",
    )
    op.add_column("municipalities",
        sa.Column("center_latitude", sa.Numeric(10, 7), nullable=True),
        schema="app",
    )
    op.add_column("municipalities",
        sa.Column("center_longitude", sa.Numeric(10, 7), nullable=True),
        schema="app",
    )
    op.add_column("municipalities",
        sa.Column("territory", postgresql.JSONB(), nullable=True),
        schema="app",
    )

    op.create_table(
        "neighborhoods",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "municipality_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app.municipalities.id", ondelete="CASCADE", name="fk_neighborhoods_mun_id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("population", sa.Integer(), nullable=True),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("territory", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("municipality_id", "name", name="uq_neighborhood_mun_name"),
        schema="app",
    )
    op.create_index(
        "ix_neighborhoods_municipality_id",
        "neighborhoods",
        ["municipality_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_neighborhoods_municipality_id", table_name="neighborhoods", schema="app")
    op.drop_table("neighborhoods", schema="app")
    op.drop_column("municipalities", "territory", schema="app")
    op.drop_column("municipalities", "center_longitude", schema="app")
    op.drop_column("municipalities", "center_latitude", schema="app")
    op.drop_column("municipalities", "population", schema="app")
