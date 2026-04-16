"""Seed da setting cadsus.base — credenciais globais de fallback

Revision ID: 0017_cadsus_base_setting
Revises: 0016_municipality_cadsus_creds
Create Date: 2026-04-16

Usada como fallback quando o município ativo não tem credenciais próprias
configuradas. Permite o MASTER configurar a base geral via /sys.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0017_cadsus_base_setting"
down_revision: str | None = "0016_municipality_cadsus_creds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO app.system_settings (id, key, value, description)
        VALUES (
            gen_random_uuid(),
            'cadsus.base',
            '{"user": "", "password": "", "url": ""}'::jsonb,
            'Credenciais CadSUS de fallback (usadas quando o município não tem as próprias)'
        )
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM app.system_settings WHERE key = 'cadsus.base'")

