"""Amplia catálogo OpenRouter e recria rotas globais

Revision ID: 0025_ai_openrouter_models
Revises: 0024_ai_prompts_real_body
Create Date: 2026-04-17

Adiciona modelos populares do OpenRouter (baratos e com vision) e
atualiza as rotas globais para preferir OpenRouter como provider
principal, com fallback pro OpenAI nos modelos proprietários.

Embedding continua no OpenAI (OpenRouter não serve embeddings com boa
relação custo/qualidade).
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_ai_openrouter_models"
down_revision: str | None = "0024_ai_prompts_real_body"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


NEW_MODELS = [
    # Google Gemini (via OpenRouter) — baratos e suportam vision
    {
        "slug": "google/gemini-2.0-flash-001",
        "display_name": "Gemini 2.0 Flash",
        "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 10,   # $0.10
        "output_cost_per_mtok": 40,  # $0.40
        "max_context": 1048576,
    },
    {
        "slug": "google/gemini-pro-1.5",
        "display_name": "Gemini 1.5 Pro",
        "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 125,  # $1.25
        "output_cost_per_mtok": 500, # $5.00
        "max_context": 2097152,
    },
    # DeepSeek — excelente relação custo/qualidade
    {
        "slug": "deepseek/deepseek-chat",
        "display_name": "DeepSeek V3",
        "capabilities": ["chat"],
        "input_cost_per_mtok": 14,   # $0.14
        "output_cost_per_mtok": 28,  # $0.28
        "max_context": 131072,
    },
    # Mistral — rápido e barato
    {
        "slug": "mistralai/mistral-small-latest",
        "display_name": "Mistral Small",
        "capabilities": ["chat"],
        "input_cost_per_mtok": 10,   # $0.10
        "output_cost_per_mtok": 30,  # $0.30
        "max_context": 128000,
    },
    # Llama 3.1 70B
    {
        "slug": "meta-llama/llama-3.1-70b-instruct",
        "display_name": "Llama 3.1 70B",
        "capabilities": ["chat"],
        "input_cost_per_mtok": 35,   # $0.35
        "output_cost_per_mtok": 40,  # $0.40
        "max_context": 131072,
    },
    # OpenAI via OpenRouter (mesmos modelos mas pagos via OpenRouter)
    {
        "slug": "openai/gpt-4o-mini",
        "display_name": "GPT-4o mini (via OpenRouter)",
        "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 15,
        "output_cost_per_mtok": 60,
        "max_context": 128000,
    },
]

# Rotas globais: capability → [(provider_slug, model_slug, priority)]
# Priority 0 = tenta primeiro (OpenRouter), 1 = fallback (OpenAI direto).
ROUTES = [
    ("chat",         "openrouter", "google/gemini-2.0-flash-001", 0),
    ("chat",         "openrouter", "deepseek/deepseek-chat",      1),
    ("chat_vision",  "openrouter", "google/gemini-2.0-flash-001", 0),
    ("chat_vision",  "openrouter", "openai/gpt-4o-mini",          1),
    ("embed_text",   "openai",     "text-embedding-3-small",      0),
]


def upgrade() -> None:
    bind = op.get_bind()

    # Pega provider_id do OpenRouter
    or_id = bind.execute(
        sa.text("SELECT id FROM app.ai_providers WHERE slug = 'openrouter'")
    ).scalar()
    if not or_id:
        return

    # Insere novos modelos (ON CONFLICT pula se já existe)
    for m in NEW_MODELS:
        stmt = sa.text(
            "INSERT INTO app.ai_models "
            "(id, provider_id, slug, display_name, capabilities, "
            "input_cost_per_mtok, output_cost_per_mtok, max_context, active) "
            "VALUES (:id, :prov, :slug, :dn, :caps, :inc, :outc, :mctx, true) "
            "ON CONFLICT (provider_id, slug) DO UPDATE SET "
            "display_name = EXCLUDED.display_name, "
            "capabilities = EXCLUDED.capabilities, "
            "input_cost_per_mtok = EXCLUDED.input_cost_per_mtok, "
            "output_cost_per_mtok = EXCLUDED.output_cost_per_mtok, "
            "max_context = EXCLUDED.max_context"
        ).bindparams(sa.bindparam("caps", type_=sa.ARRAY(sa.String(30))))
        bind.execute(
            stmt,
            {
                "id": str(uuid.uuid4()),
                "prov": or_id,
                "slug": m["slug"],
                "dn": m["display_name"],
                "caps": list(m["capabilities"]),
                "inc": m["input_cost_per_mtok"],
                "outc": m["output_cost_per_mtok"],
                "mctx": m["max_context"],
            },
        )

    # Atualiza capabilities do Claude 3.5 Haiku (suporta vision)
    bind.execute(
        sa.text(
            "UPDATE app.ai_models SET capabilities = '{chat,chat_vision}'::varchar[] "
            "WHERE slug = 'anthropic/claude-3.5-haiku'"
        )
    )

    # Limpa rotas globais existentes e recria com a nova priorização.
    bind.execute(
        sa.text(
            "DELETE FROM app.ai_capability_routes "
            "WHERE scope = 'global' AND municipality_id IS NULL"
        )
    )

    for capability, provider_slug, model_slug, priority in ROUTES:
        model_id = bind.execute(
            sa.text(
                "SELECT m.id FROM app.ai_models m "
                "JOIN app.ai_providers p ON p.id = m.provider_id "
                "WHERE p.slug = :ps AND m.slug = :ms"
            ),
            {"ps": provider_slug, "ms": model_slug},
        ).scalar()
        if not model_id:
            continue

        bind.execute(
            sa.text(
                "INSERT INTO app.ai_capability_routes "
                "(id, scope, municipality_id, module_code, capability, model_id, priority, active) "
                "VALUES (:id, 'global', NULL, NULL, :cap, :mid, :prio, true)"
            ),
            {
                "id": str(uuid.uuid4()),
                "cap": capability,
                "mid": model_id,
                "prio": priority,
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM app.ai_capability_routes "
            "WHERE scope = 'global' AND municipality_id IS NULL"
        )
    )
    for m in NEW_MODELS:
        bind.execute(
            sa.text("DELETE FROM app.ai_models WHERE slug = :slug"),
            {"slug": m["slug"]},
        )
