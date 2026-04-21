"""UNIQUE em ``users.cns`` (permite múltiplos NULL).

Revision ID: 0049_user_cns_unique
Revises: 0048_user_cns
Create Date: 2026-04-20

CNS é o identificador nacional único de saúde — dois usuários distintos
nunca compartilham o mesmo cartão. Postgres aceita múltiplos NULL em
coluna UNIQUE, o que casa com a semântica "opcional" do campo.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0049_user_cns_unique"
down_revision: str | None = "0048_user_cns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_users_cns",
        "users",
        ["cns"],
        unique=True,
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_users_cns", table_name="users", schema="app")
