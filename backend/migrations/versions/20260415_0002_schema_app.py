"""Move tabelas do schema public para o schema app.

Revision ID: 0002_schema_app
Revises: 0001_initial
Create Date: 2026-04-15
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002_schema_app"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = [
    "users",
    "municipalities",
    "facilities",
    "municipality_accesses",
    "facility_accesses",
    "roles",
    "permissions",
    "role_permissions",
    "refresh_tokens",
    "password_resets",
    "login_attempts",
    "audit_logs",
]


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "app"')
    for t in TABLES:
        op.execute(f'ALTER TABLE IF EXISTS public."{t}" SET SCHEMA "app"')


def downgrade() -> None:
    for t in TABLES:
        op.execute(f'ALTER TABLE IF EXISTS "app"."{t}" SET SCHEMA public')
    op.execute('DROP SCHEMA IF EXISTS "app"')
