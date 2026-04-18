"""Tornar ``users.cpf`` e ``users.email`` nullable.

Revision ID: 0031_user_cpf_email_nullable
Revises: 0030_user_social_name
Create Date: 2026-04-18

Antes: ambos ``cpf`` e ``email`` eram NOT NULL. Agora é exigido **pelo
menos um** dos dois (validado em camada de service/schema). Ambos
continuam UNIQUE — a unicidade em Postgres e Oracle aceita múltiplos
NULL, permitindo vários usuários sem e-mail OU sem CPF.

Motivação: alguns usuários podem não ter e-mail (ex.: profissionais
que só têm CPF) ou contas técnicas/bots que não têm CPF (só e-mail de
serviço).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031_user_cpf_email_nullable"
down_revision: str | None = "0030_user_social_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "users", "cpf",
        existing_type=sa.String(11),
        nullable=True,
        schema="app",
    )
    op.alter_column(
        "users", "email",
        existing_type=sa.String(200),
        nullable=True,
        schema="app",
    )


def downgrade() -> None:
    op.alter_column(
        "users", "email",
        existing_type=sa.String(200),
        nullable=False,
        schema="app",
    )
    op.alter_column(
        "users", "cpf",
        existing_type=sa.String(11),
        nullable=False,
        schema="app",
    )
