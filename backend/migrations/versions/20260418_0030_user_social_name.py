"""Nome social do usuário (coluna auto-editável pelo próprio usuário).

Revision ID: 0030_user_social_name
Revises: 0029_user_photos_and_face
Create Date: 2026-04-18

Adiciona ``users.social_name`` — como a pessoa quer ser chamada. Quando
vazio, o frontend usa ``name``. Editável pela página "Minha Conta" do
próprio usuário (``PATCH /users/me``).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0030_user_social_name"
down_revision: str | None = "0029_user_photos_and_face"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "social_name",
            sa.String(200),
            nullable=False,
            server_default=" ",
        ),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("users", "social_name", schema="app")
