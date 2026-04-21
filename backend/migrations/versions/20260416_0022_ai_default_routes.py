"""Seed de rotas globais padrão

Revision ID: 0022_ai_default_routes
Revises: 0021_ai_global_scope
Create Date: 2026-04-16

Cria rotas globais padrão pras 3 capabilities usadas em F1 apontando
pra modelos OpenAI (escolha conservadora: mais barato que funciona).
SYS admin pode sobrescrever depois em /sys/ia.

Idempotente — verifica se já existe rota (scope=global, capability, model)
antes de inserir.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_ai_default_routes"
down_revision: str | None = "0021_ai_global_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# (capability, provider_slug, model_slug, priority)
DEFAULT_ROUTES: list[tuple[str, str, str, int]] = [
    ("chat",         "openai", "gpt-4o-mini",             0),
    ("chat_vision",  "openai", "gpt-4o-mini",             0),
    ("embed_text",   "openai", "text-embedding-3-small",  0),
]


def upgrade() -> None:
    bind = op.get_bind()

    for capability, provider_slug, model_slug, priority in DEFAULT_ROUTES:
        model_id = bind.execute(
            sa.text(
                """
                SELECT m.id FROM app.ai_models m
                JOIN app.ai_providers p ON p.id = m.provider_id
                WHERE p.slug = :p AND m.slug = :m
                """
            ),
            {"p": provider_slug, "m": model_slug},
        ).scalar()
        if not model_id:
            continue

        # Idempotência: evita duplicar se já existe rota global pra essa
        # capability nessa priority.
        exists = bind.execute(
            sa.text(
                """
                SELECT 1 FROM app.ai_capability_routes
                WHERE scope = 'global'
                  AND municipality_id IS NULL
                  AND module_code IS NULL
                  AND capability = :cap
                  AND priority = :prio
                """
            ),
            {"cap": capability, "prio": priority},
        ).scalar()
        if exists:
            continue

        bind.execute(
            sa.text(
                """
                INSERT INTO app.ai_capability_routes
                  (id, scope, municipality_id, module_code, capability, model_id, priority, active)
                VALUES
                  (:id, 'global', NULL, NULL, :cap, :mid, :prio, true)
                """
            ),
            {"id": str(uuid.uuid4()), "cap": capability, "mid": model_id, "prio": priority},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for capability, _, _, priority in DEFAULT_ROUTES:
        bind.execute(
            sa.text(
                """
                DELETE FROM app.ai_capability_routes
                WHERE scope = 'global'
                  AND municipality_id IS NULL
                  AND module_code IS NULL
                  AND capability = :cap
                  AND priority = :prio
                """
            ),
            {"cap": capability, "prio": priority},
        )
