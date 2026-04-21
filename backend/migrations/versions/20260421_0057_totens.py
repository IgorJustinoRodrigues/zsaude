"""Tabela ``totens`` — totens lógicos (scoped).

Revision ID: 0057_totens
Revises: 0056_painels
Create Date: 2026-04-21

Um **totem** é uma configuração nomeada de autoatendimento: formas de
identificação aceitas (CPF/CNS/face/nome manual) e se pergunta
prioridade. Totem não está vinculado a setor — ele só emite senha.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType, UUIDType

revision: str = "0057_totens"
down_revision: str | None = "0056_painels"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "totens",
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("scope_id", UUIDType(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        # capture = { cpf, cns, face, manual_name } como JSONB.
        sa.Column(
            "capture", JSONType(), nullable=False,
            server_default='{"cpf":true,"cns":true,"face":false,"manual_name":true}',
        ),
        sa.Column(
            "priority_prompt", sa.Boolean(),
            nullable=False, server_default=sa.text("true"),
        ),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_totens"),
        sa.CheckConstraint(
            "scope_type IN ('municipality', 'facility')",
            name="ck_totens_scope_type",
        ),
        sa.UniqueConstraint(
            "scope_type", "scope_id", "name",
            name="uq_totens_scope_name",
        ),
        schema="app",
    )
    op.create_index(
        "ix_totens_scope", "totens",
        ["scope_type", "scope_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_totens_scope", table_name="totens", schema="app")
    op.drop_table("totens", schema="app")
