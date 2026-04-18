"""Identidade visual por município e unidade (``branding_configs``).

Revision ID: 0034_branding_configs
Revises: 0033_must_change_password
Create Date: 2026-04-18

Tabela única com ``scope_type`` em ``('municipality', 'facility')``. Uma
linha por escopo — o service faz merge campo-a-campo da config da
unidade com a da cidade, caindo em defaults do sistema se ambos vazios.

Campos básicos:
- ``logo_file_id`` → ``app.files`` (upload via storage).
- ``display_name`` / ``header_line_1`` / ``header_line_2`` / ``footer_text``.
- ``primary_color`` em hex (``#RRGGBB``).

``pdf_configs`` é um JSON aberto com três chaves (``report``, ``export``,
``prescription``). Por enquanto serve pra flags gerais; a estrutura
interna cresce conforme a gente adiciona templates específicos —
sem migration nova.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType, UUIDType

revision: str = "0034_branding_configs"
down_revision: str | None = "0033_must_change_password"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "branding_configs",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("scope_id", UUIDType(), nullable=False),
        sa.Column(
            "logo_file_id",
            UUIDType(),
            sa.ForeignKey("app.files.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("display_name", sa.String(200), nullable=False, server_default=" "),
        sa.Column("header_line_1", sa.String(200), nullable=False, server_default=" "),
        sa.Column("header_line_2", sa.String(200), nullable=False, server_default=" "),
        sa.Column("footer_text", sa.String(500), nullable=False, server_default=" "),
        sa.Column("primary_color", sa.String(16), nullable=False, server_default=" "),
        # JSON sem server_default — Oracle não aceita ``'{}'`` como literal
        # em DDL. ``BrandingConfig.pdf_configs`` é ``default=dict`` no model,
        # então todo INSERT Python-side popula corretamente.
        sa.Column("pdf_configs", JSONType(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("scope_type", "scope_id", name="uq_branding_scope"),
        sa.CheckConstraint(
            "scope_type IN ('municipality', 'facility')",
            name="ck_branding_scope_type",
        ),
        schema="app",
    )
    op.create_index(
        "ix_app_branding_scope",
        "branding_configs",
        ["scope_type", "scope_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_app_branding_scope", table_name="branding_configs", schema="app")
    op.drop_table("branding_configs", schema="app")
