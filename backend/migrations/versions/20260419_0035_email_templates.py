"""Templates de e-mail com herança de escopo (``email_templates``).

Revision ID: 0035_email_templates
Revises: 0034_branding_configs
Create Date: 2026-04-19

Tabela que armazena **overrides** dos templates de e-mail por escopo:

- ``scope_type='system'``: padrão global (MASTER edita).
- ``scope_type='municipality'``: sobrescreve pro município (ADMIN edita).
- ``scope_type='facility'``: sobrescreve pra unidade específica (ADMIN edita).

A resolução em tempo de render é em cascata: FACILITY → MUNICIPALITY →
SYSTEM (banco) → templates de arquivo embarcados em ``app/templates/email/``.
Ou seja: sem nenhuma linha nessa tabela, o sistema segue funcionando com
os defaults de código.

Para a constraint UNIQUE funcionar em Postgres e Oracle sem depender de
partial indexes ou NULL-comparison semantics, usamos uma **sentinel UUID**
(``00000000-0000-0000-0000-000000000000``) em ``scope_id`` quando o escopo
é ``system``. Service sempre traduz.

``subject`` e ``body_*`` guardam fonte Jinja2 que é renderizada em sandbox
(``SandboxedEnvironment`` + ``autoescape`` em HTML + ``StrictUndefined``).
Nenhum código arbitrário é executável por quem edita pela UI.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0035_email_templates"
down_revision: str | None = "0034_branding_configs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_templates",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("scope_id", UUIDType(), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False, server_default=" "),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("from_name", sa.String(200), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
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
        sa.UniqueConstraint(
            "code", "scope_type", "scope_id", name="uq_email_templates_scope",
        ),
        sa.CheckConstraint(
            "scope_type IN ('system', 'municipality', 'facility')",
            name="ck_email_templates_scope_type",
        ),
        schema="app",
    )
    op.create_index(
        "ix_app_email_templates_code_scope",
        "email_templates",
        ["code", "scope_type"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_app_email_templates_code_scope", table_name="email_templates", schema="app")
    op.drop_table("email_templates", schema="app")
