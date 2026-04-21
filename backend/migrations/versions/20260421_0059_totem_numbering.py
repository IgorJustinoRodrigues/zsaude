"""Personalização de numeração por totem + contadores.

Revision ID: 0059_totem_numbering
Revises: 0058_device_links
Create Date: 2026-04-21

Adiciona em ``app.totens`` campos pra personalizar como as senhas são
formatadas e quando o contador reseta. Cria ``app.totem_counters`` pra
guardar o sequencial atual de cada ``(totem, período, prefixo)``.

Padrões:
- ``ticket_prefix_normal``  = ``R`` (senha comum)
- ``ticket_prefix_priority`` = ``P`` (senha prioritária)
- ``reset_strategy``         = ``daily`` (também aceita weekly/monthly/never)
- ``number_padding``         = ``3``  (ex.: ``R-047``)

Cada município/unidade pode ajustar os prefixos/reset dos totens lógicos
ao editá-los em `/sys/.../recursos/totens`.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0059_totem_numbering"
down_revision: str | None = "0058_device_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── totens: adiciona campos de numeração ──────────────────────
    op.add_column(
        "totens",
        sa.Column(
            "ticket_prefix_normal", sa.String(5),
            nullable=False, server_default="R",
        ),
        schema="app",
    )
    op.add_column(
        "totens",
        sa.Column(
            "ticket_prefix_priority", sa.String(5),
            nullable=False, server_default="P",
        ),
        schema="app",
    )
    op.add_column(
        "totens",
        sa.Column(
            "reset_strategy", sa.String(10),
            nullable=False, server_default="daily",
        ),
        schema="app",
    )
    op.add_column(
        "totens",
        sa.Column(
            "number_padding", sa.Integer(),
            nullable=False, server_default="3",
        ),
        schema="app",
    )
    op.create_check_constraint(
        "ck_totens_reset_strategy",
        "totens",
        "reset_strategy IN ('daily', 'weekly', 'monthly', 'never')",
        schema="app",
    )

    # ── totem_counters ─────────────────────────────────────────────
    op.create_table(
        "totem_counters",
        sa.Column(
            "totem_id", UUIDType(),
            sa.ForeignKey("app.totens.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Prefixo específico (normal ou priority) — porque os dois podem
        # ter sequenciais independentes.
        sa.Column("prefix", sa.String(5), nullable=False),
        # "YYYY-MM-DD" (daily), "YYYY-Www" (weekly), "YYYY-MM" (monthly),
        # "" (never). Calculado no timezone do município do totem.
        sa.Column("period_key", sa.String(20), nullable=False),
        sa.Column("current_number", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.PrimaryKeyConstraint(
            "totem_id", "prefix", "period_key",
            name="pk_totem_counters",
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_table("totem_counters", schema="app")
    op.drop_constraint("ck_totens_reset_strategy", "totens", schema="app", type_="check")
    op.drop_column("totens", "number_padding", schema="app")
    op.drop_column("totens", "reset_strategy", schema="app")
    op.drop_column("totens", "ticket_prefix_priority", schema="app")
    op.drop_column("totens", "ticket_prefix_normal", schema="app")
