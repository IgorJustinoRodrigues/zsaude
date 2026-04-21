"""Fuso horário por município (``municipalities.timezone``).

Revision ID: 0037_municipality_timezone
Revises: 0036_email_verification
Create Date: 2026-04-19

Identifier IANA (ex.: ``America/Sao_Paulo``, ``America/Manaus``,
``America/Cuiaba``, ``America/Belem``, ``America/Rio_Branco``,
``America/Fortaleza``). Default em SP — cobre ~90% do Brasil.

Usado por features time-aware (parabéns, agenda clínica, janelas de
disponibilidade, auditoria localizada). Nível município — no Brasil
nenhuma cidade tem unidades em fusos diferentes entre si.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0037_municipality_timezone"
down_revision: str | None = "0036_email_verification"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "municipalities",
        sa.Column(
            "timezone",
            sa.String(64),
            nullable=False,
            server_default="America/Sao_Paulo",
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("municipalities", "timezone", schema="app")
