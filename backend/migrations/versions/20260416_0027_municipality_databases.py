"""Tabela de overrides de banco por município (multi-database).

Revision ID: 0027_municipality_databases
Revises: 0026_ai_cost_precision
Create Date: 2026-04-16

Permite que cada município aponte para uma conexão própria (PG ou Oracle).
Quando vazia, todos usam o banco principal da aplicação.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.db.types import UUIDType
revision: str = "0027_municipality_databases"
down_revision: str | None = "0026_ai_cost_precision"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "municipality_databases",
        sa.Column("municipality_id", UUIDType(), primary_key=True),
        sa.Column("dialect", sa.String(20), nullable=False),
        sa.Column("connection_url_encrypted", sa.Text(), nullable=False),
        sa.Column("pool_size", sa.Integer(), nullable=False, server_default=sa.text("5")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["municipality_id"],
            ["app.municipalities.id"],
            ondelete="CASCADE",
            name="fk_mun_databases_municipality_id",
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_table("municipality_databases", schema="app")
