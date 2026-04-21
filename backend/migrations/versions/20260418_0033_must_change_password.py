"""Flag ``users.must_change_password``.

Revision ID: 0033_must_change_password
Revises: 0032_password_policy
Create Date: 2026-04-18

Quando ``True``, força o usuário a trocar a senha antes de conseguir
navegar no sistema. Marcado como ``True`` quando a senha é gerada
por admin (``admin_reset_password``) — a senha é provisória.
Volta a ``False`` quando o usuário troca por uma escolhida por ele.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0033_must_change_password"
down_revision: str | None = "0032_password_policy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("users", "must_change_password", schema="app")
