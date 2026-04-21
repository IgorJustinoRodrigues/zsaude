"""Adiciona credenciais CadSUS em municipalities

Revision ID: 0016_municipality_cadsus_creds
Revises: 0015_tipos_documento_cleanup
Create Date: 2026-04-16

Cada secretaria municipal recebe do DATASUS credenciais próprias no formato
``CADSUS.SMS.{MUNICIPIO}.{UF}``. Armazenadas como strings simples; a camada
de serviço resolve as credenciais do município ativo pela WorkContext.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_municipality_cadsus_creds"
down_revision: str | None = "0015_tipos_documento_cleanup"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "municipalities",
        sa.Column("cadsus_user", sa.String(100), nullable=False, server_default=" "),
        schema="app",
    )
    op.add_column(
        "municipalities",
        sa.Column("cadsus_password", sa.String(200), nullable=False, server_default=" "),
        schema="app",
    )


def downgrade() -> None:
    op.drop_column("municipalities", "cadsus_password", schema="app")
    op.drop_column("municipalities", "cadsus_user", schema="app")
