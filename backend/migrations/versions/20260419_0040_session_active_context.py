"""Município/unidade **ativos** na sessão pra filtrar presença corretamente.

Revision ID: 0040_session_active_context
Revises: 0039_email_credentials
Create Date: 2026-04-19

Antes, a listagem de "quem está online" filtrava por ``MunicipalityAccess``
— o que dava falso positivo: um usuário com acesso a A+B, logado hoje em
B, ainda aparecia online em A. Agora cada sessão guarda
``active_municipality_id`` / ``active_facility_id``, preenchidos a partir
do ``X-Work-Context`` em cada request, e a query de presença filtra por
isso. MASTER fica de fora da presença escopada (não "atua" num município).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0040_session_active_context"
down_revision: str | None = "0039_email_credentials"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column("active_municipality_id", UUIDType(), nullable=True),
        schema="app",
    )
    op.add_column(
        "user_sessions",
        sa.Column("active_facility_id", UUIDType(), nullable=True),
        schema="app",
    )
    op.create_index(
        "ix_user_sessions_active_mun",
        "user_sessions",
        ["active_municipality_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_sessions_active_mun", table_name="user_sessions", schema="app",
    )
    op.drop_column("user_sessions", "active_facility_id", schema="app")
    op.drop_column("user_sessions", "active_municipality_id", schema="app")
