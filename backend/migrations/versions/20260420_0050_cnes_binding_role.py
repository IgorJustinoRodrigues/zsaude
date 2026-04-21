"""Adiciona ``role_id`` opcional em ``facility_access_cnes_bindings``.

Revision ID: 0050_cnes_binding_role
Revises: 0049_user_cns_unique
Create Date: 2026-04-20

Cada vínculo CBO-profissional pode ter um ``role_id`` próprio — isso
permite que o mesmo usuário tenha perfis distintos por CBO na mesma
unidade. Quando ``null``, cai no ``role_id`` do ``FacilityAccess`` pai.

A troca de role é aplicada no momento em que o work-context seleciona
o binding ativo — o ``PermissionService.resolve`` usa o role do binding
como override quando presente.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0050_cnes_binding_role"
down_revision: str | None = "0049_user_cns_unique"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "facility_access_cnes_bindings",
        sa.Column("role_id", sa.Uuid(), nullable=True),
        schema="app",
    )
    op.create_foreign_key(
        "fk_fa_cnes_binding_role",
        "facility_access_cnes_bindings",
        "roles",
        ["role_id"], ["id"],
        source_schema="app", referent_schema="app",
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_fa_cnes_binding_role_id",
        "facility_access_cnes_bindings",
        ["role_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_fa_cnes_binding_role_id",
        table_name="facility_access_cnes_bindings",
        schema="app",
    )
    op.drop_constraint(
        "fk_fa_cnes_binding_role",
        "facility_access_cnes_bindings",
        schema="app",
    )
    op.drop_column(
        "facility_access_cnes_bindings",
        "role_id",
        schema="app",
    )
