"""Flags de revisão de identidade em pacientes e fotos.

Revision ID: t0011_identity_review
Revises: t0010_attendance_sector_status
Create Date: 2026-04-21

Quando o enroll facial detecta que a foto nova é muito diferente do
embedding atual do paciente (possível tentativa de spoofing), marca:

- ``patients.identity_review_needed`` = true (badge pro recepcionista)
- ``patients.identity_review_reason`` = motivo
- ``patients.identity_review_at`` = timestamp
- ``patient_photos.flagged`` = true (destaca qual foto disparou o alerta)

A recepção revisa, ajusta fotos se precisar, e limpa o flag.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "t0011_identity_review"
down_revision: str | None = "t0010_attendance_sector_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column(
            "identity_review_needed", sa.Boolean(),
            nullable=False, server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "patients",
        sa.Column("identity_review_reason", sa.String(120), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column(
            "identity_review_at", sa.TIMESTAMP(timezone=True), nullable=True,
        ),
    )
    op.add_column(
        "patient_photos",
        sa.Column(
            "flagged", sa.Boolean(),
            nullable=False, server_default=sa.text("false"),
        ),
    )
    # Índice parcial pra query "quem precisa revisar" ficar rápida.
    op.create_index(
        "ix_patients_identity_review",
        "patients", ["identity_review_at"],
        postgresql_where=sa.text("identity_review_needed = true"),
    )


def downgrade() -> None:
    op.drop_index("ix_patients_identity_review", table_name="patients")
    op.drop_column("patient_photos", "flagged")
    op.drop_column("patients", "identity_review_at")
    op.drop_column("patients", "identity_review_reason")
    op.drop_column("patients", "identity_review_needed")
