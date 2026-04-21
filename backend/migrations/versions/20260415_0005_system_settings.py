"""Cria app.system_settings

Revision ID: 0005_system_settings
Revises: 0004_archived_flags
Create Date: 2026-04-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.types import JSONType, UUIDType
revision: str = "0005_system_settings"
down_revision: str | None = "0004_archived_flags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("value", JSONType(), nullable=False),
        sa.Column("description", sa.String(300), nullable=False, server_default=" "),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("key", name="uq_system_settings_key"),
        schema="app",
    )
    op.create_index("ix_system_settings_key", "system_settings", ["key"], schema="app")

    # Seed de chaves padrão
    op.execute("""
        INSERT INTO app.system_settings (id, key, value, description) VALUES
        (gen_random_uuid(), 'password_min_length',       '8',      'Comprimento mínimo de senha'),
        (gen_random_uuid(), 'password_require_special',  'true',   'Exige caractere especial em senhas'),
        (gen_random_uuid(), 'access_token_ttl_minutes',  '15',     'TTL do access token (min)'),
        (gen_random_uuid(), 'refresh_token_ttl_days',    '30',     'TTL do refresh token (dias)'),
        (gen_random_uuid(), 'login_rate_limit_per_min',  '5',      'Tentativas de login por IP/min'),
        (gen_random_uuid(), 'default_language',          '"pt-BR"','Idioma padrão'),
        (gen_random_uuid(), 'app_name',                  '"zSaúde"','Nome exibido')
    """)


def downgrade() -> None:
    op.drop_index("ix_system_settings_key", table_name="system_settings", schema="app")
    op.drop_table("system_settings", schema="app")
