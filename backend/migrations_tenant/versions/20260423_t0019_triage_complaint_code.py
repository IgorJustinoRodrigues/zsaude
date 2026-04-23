"""Adiciona complaint_code a triage_records (Fase G — protocolo Campinas).

Revision ID: t0019_triage_complaint_code
Revises: t0018_attendance_procedures
Create Date: 2026-04-23

Fase G traz o protocolo Campinas: triador escolhe uma queixa principal
(fluxograma) e marca os discriminadores que bateram. O catálogo vive no
código (constante Python — migração pra DB fica pra Fase G2 quando
município precisar customizar). Aqui guardamos só qual fluxograma foi
usado — os campos ``risk_auto_suggested`` e ``risk_override_reason`` já
existem desde a Fase A pra completar o quadro.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "t0019_triage_complaint_code"
down_revision: str | None = "t0018_attendance_procedures"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "triage_records",
        sa.Column("complaint_code", sa.String(30), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("triage_records", "complaint_code")
