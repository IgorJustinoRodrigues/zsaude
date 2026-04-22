"""Flag ``available_in_reception`` no setor.

Revision ID: 0061_sector_reception_flag
Revises: 0060_totem_default_sector
Create Date: 2026-04-22

Permite ao admin filtrar quais setores aparecem no modal de
encaminhamento da recepção. Default ``true`` — mantém comportamento
atual (todos aparecem). Admin desmarca os que não se aplicam (ex.:
"Sala de Observação" não recebe paciente diretamente da recepção).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0061_sector_reception_flag"
down_revision: str | None = "0060_totem_default_sector"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sectors",
        sa.Column(
            "available_in_reception",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("sectors", "available_in_reception", schema="app")
