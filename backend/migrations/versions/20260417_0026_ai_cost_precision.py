"""Aumenta precisão do custo de INTEGER pra NUMERIC(12,6)

Revision ID: 0026_ai_cost_precision
Revises: 0025_ai_openrouter_models
Create Date: 2026-04-17

Chamadas baratas (ex: $0.000237) apareciam como $0.01 (ceildiv pra 1 cent).
Com NUMERIC(12,6) o custo é armazenado com 6 casas decimais de centavo,
permitindo display preciso.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0026_ai_cost_precision"
down_revision: str | None = "0025_ai_openrouter_models"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE app.ai_usage_logs "
        "ALTER COLUMN total_cost_cents TYPE NUMERIC(12,6) USING total_cost_cents::numeric"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE app.ai_usage_logs "
        "ALTER COLUMN total_cost_cents TYPE INTEGER USING ROUND(total_cost_cents)::integer"
    )
