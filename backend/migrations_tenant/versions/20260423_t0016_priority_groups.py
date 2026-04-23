"""Cria priority_groups com seed dos 4 grupos prioritários legais.

Revision ID: t0016_priority_groups
Revises: t0015_triage_records
Create Date: 2026-04-23

Fase C da tela de triagem: grupos prioritários por município (tabela
tenant). Seed com os 4 grupos da legislação (Lei 10.048/2000,
10.741/2003): gestante, idoso (≥60), pessoa com deficiência, criança
de colo. Município pode adicionar outros via MASTER (ex.: lactante,
doador de sangue).
"""
from __future__ import annotations

import uuid as _uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "t0016_priority_groups"
down_revision: str | None = "t0015_triage_records"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PG_UUID = UUIDType()


def upgrade() -> None:
    op.create_table(
        "priority_groups",
        sa.Column("id", PG_UUID, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("description", sa.String(300), nullable=False, server_default=" "),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # Seed dos 4 grupos legais.
    defaults = [
        ("Gestante",              "Gestantes (Lei 10.048/2000).",        10),
        ("Idoso (≥60 anos)",      "Pessoas com 60+ anos (Lei 10.741/2003).", 20),
        ("Pessoa com deficiência", "PCD (Lei 10.048/2000).",             30),
        ("Criança de colo",       "Adulto com criança de colo (Lei 10.048/2000).", 40),
    ]
    # UUID v7 seria ideal mas o alembic não tem acesso ao helper — uuid4
    # aqui resolve; os IDs nascidos em seed não têm garantia de ordem
    # monotônica, o que não importa pra domínio de referência.
    table = sa.table(
        "priority_groups",
        sa.column("id", PG_UUID),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("display_order", sa.Integer),
    )
    op.bulk_insert(table, [
        {"id": _uuid.uuid4(), "name": n, "description": d, "display_order": o}
        for n, d, o in defaults
    ])


def downgrade() -> None:
    op.drop_table("priority_groups")
