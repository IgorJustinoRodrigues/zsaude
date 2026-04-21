"""Módulos habilitados por unidade (``facilities.enabled_modules``).

Revision ID: 0041_facility_enabled_modules
Revises: 0040_session_active_context
Create Date: 2026-04-20

Permite que cada unidade (facility) limite quais módulos do município
estão disponíveis naquela unidade específica. Semântica:

- ``NULL`` (default): herda integralmente ``Municipality.enabled_modules``.
- Lista: subset que a unidade personalizou. O backend sempre re-intersecta
  com o conjunto do município na hora da resolução — ligar um módulo na
  unidade que o município desativou não tem efeito.

A cascata efetiva em runtime:

    modules = role.permissions.modules()
            ∩ Municipality.enabled_modules  (ou OPERATIONAL_MODULES se NULL)
            ∩ Facility.enabled_modules      (se não-NULL)
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType

revision: str = "0041_facility_enabled_modules"
down_revision: str | None = "0040_session_active_context"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "facilities",
        sa.Column("enabled_modules", JSONType(), nullable=True),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("facilities", "enabled_modules", schema="app")
