"""Tabela ``cbo_abilities`` — mapeamento CBO → direito profissional.

Revision ID: 0051_cbo_abilities
Revises: 0050_cnes_binding_role
Create Date: 2026-04-20

Decoupling entre perfil (role) e função clínica: o role controla o que o
usuário faz **na UI do sistema**; o CBO controla o que ele tem direito
**como profissional** (prescrever, dispensar, liberar laudo, etc.).

Ação clínica passa por dois gates:
    role_permission(X) AND cbo_has_ability(Y)

Esta tabela armazena o segundo gate. O catálogo de ``ability_code`` vive
em ``app.core.cbo_abilities.registry`` (código, não tabela), mesmo
padrão do catálogo de permissões.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0051_cbo_abilities"
down_revision: str | None = "0050_cnes_binding_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cbo_abilities",
        sa.Column("cbo_id", sa.String(length=6), nullable=False),
        sa.Column("ability_code", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("cbo_id", "ability_code", name="pk_cbo_abilities"),
        schema="app",
    )
    op.create_index(
        "ix_cbo_abilities_cbo_id",
        "cbo_abilities", ["cbo_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_cbo_abilities_cbo_id", table_name="cbo_abilities", schema="app")
    op.drop_table("cbo_abilities", schema="app")
