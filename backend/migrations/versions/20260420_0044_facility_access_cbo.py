"""Vínculo CBO/CNES no acesso do usuário à unidade.

Revision ID: 0044_facility_access_cbo
Revises: 0043_notifications_broadcast
Create Date: 2026-04-20

Adiciona 3 colunas em ``facility_accesses`` para vincular o acesso
operacional de um usuário numa unidade a um registro do CNES (profissional
+ CBO). Todas opcionais — o acesso segue funcionando sem vínculo.

- ``cbo_id``                — código CBO (6 dígitos, ex. "223505").
- ``cbo_description``       — descrição do CBO (snapshot no momento do vínculo).
- ``cnes_professional_id``  — id_profissional do CNES, ponteiro pra
  ``cnes_professionals`` no schema do município.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0044_facility_access_cbo"
down_revision: str | None = "0043_notifications_broadcast"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "facility_accesses",
        sa.Column("cbo_id", sa.String(6), nullable=True),
        schema="app",
    )
    op.add_column(
        "facility_accesses",
        sa.Column("cbo_description", sa.String(255), nullable=True),
        schema="app",
    )
    op.add_column(
        "facility_accesses",
        sa.Column("cnes_professional_id", sa.String(16), nullable=True),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("facility_accesses", "cnes_professional_id", schema="app")
    op.drop_column("facility_accesses", "cbo_description", schema="app")
    op.drop_column("facility_accesses", "cbo_id", schema="app")
