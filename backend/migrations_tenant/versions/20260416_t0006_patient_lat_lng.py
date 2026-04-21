"""Adiciona latitude/longitude em patients

Revision ID: t0006_patient_lat_lng
Revises: t0005_cpf_optional
Create Date: 2026-04-16

Coordenadas do endereço (resultado de geocoding ou ajuste manual no
cadastro). Numeric(10, 7) cobre todo o globo com ~1cm de precisão.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "t0006_patient_lat_lng"
down_revision: str | None = "t0005_cpf_optional"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("latitude",  sa.Numeric(10, 7), nullable=True))
    op.add_column("patients", sa.Column("longitude", sa.Numeric(10, 7), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "longitude")
    op.drop_column("patients", "latitude")
