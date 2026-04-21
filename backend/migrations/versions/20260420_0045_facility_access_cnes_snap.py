"""Snapshot CPF/nome do profissional CNES no acesso (pra detectar mudanças).

Revision ID: 0045_fac_access_cnes_snap
Revises: 0044_facility_access_cbo
Create Date: 2026-04-20

Estende ``facility_accesses`` com o CPF e nome do profissional no momento
do vínculo. A nova importação CNES compara esses snapshots com o estado
vigente — qualquer divergência gera notificação.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0045_fac_access_cnes_snap"
down_revision: str | None = "0044_facility_access_cbo"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "facility_accesses",
        sa.Column("cnes_snapshot_cpf", sa.String(11), nullable=True),
        schema="app",
    )
    op.add_column(
        "facility_accesses",
        sa.Column("cnes_snapshot_nome", sa.String(200), nullable=True),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("facility_accesses", "cnes_snapshot_nome", schema="app")
    op.drop_column("facility_accesses", "cnes_snapshot_cpf", schema="app")
