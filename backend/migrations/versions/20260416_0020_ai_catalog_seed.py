"""Seed inicial do catálogo de IA (providers, modelos, prompts)

Revision ID: 0020_ai_catalog_seed
Revises: 0019_ai_core_tables
Create Date: 2026-04-16

Popula os 3 providers da Fase 1 e um conjunto mínimo de modelos com preços
de referência (em centavos de USD por 1M tokens — cents per million tokens
"cents_per_mtok"). Admin SYS ajusta depois.

Seed idempotente: usa ON CONFLICT DO NOTHING onde possível. Re-rodar não
duplica nem atualiza.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_ai_catalog_seed"
down_revision: str | None = "0019_ai_core_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PROVIDERS = [
    {
        "slug": "openai",
        "display_name": "OpenAI",
        "sdk_kind": "openai",
        "base_url_default": "",  # SDK usa api.openai.com por padrão
        "capabilities": ["chat", "chat_vision", "embed_text"],
    },
    {
        "slug": "openrouter",
        "display_name": "OpenRouter",
        "sdk_kind": "openrouter",
        "base_url_default": "https://openrouter.ai/api/v1",
        "capabilities": ["chat", "chat_vision", "embed_text"],
    },
    {
        "slug": "ollama",
        "display_name": "Ollama (local)",
        "sdk_kind": "ollama",
        "base_url_default": "http://localhost:11434",
        "capabilities": ["chat", "chat_vision", "embed_text"],
    },
]

# cents por 1 milhão de tokens (ex: $0.15 → 15 cents)
MODELS = [
    # OpenAI
    {
        "provider_slug": "openai", "slug": "gpt-4o-mini",
        "display_name": "GPT-4o mini", "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 15, "output_cost_per_mtok": 60, "max_context": 128000,
    },
    {
        "provider_slug": "openai", "slug": "gpt-4o",
        "display_name": "GPT-4o", "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 250, "output_cost_per_mtok": 1000, "max_context": 128000,
    },
    {
        "provider_slug": "openai", "slug": "text-embedding-3-small",
        "display_name": "Text Embedding 3 Small", "capabilities": ["embed_text"],
        "input_cost_per_mtok": 2, "output_cost_per_mtok": 0, "max_context": 8192,
    },
    {
        "provider_slug": "openai", "slug": "text-embedding-3-large",
        "display_name": "Text Embedding 3 Large", "capabilities": ["embed_text"],
        "input_cost_per_mtok": 13, "output_cost_per_mtok": 0, "max_context": 8192,
    },
    # OpenRouter (algumas das mais usadas — admin adiciona mais)
    {
        "provider_slug": "openrouter", "slug": "anthropic/claude-3.5-sonnet",
        "display_name": "Claude 3.5 Sonnet (via OpenRouter)",
        "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 300, "output_cost_per_mtok": 1500, "max_context": 200000,
    },
    {
        "provider_slug": "openrouter", "slug": "anthropic/claude-3.5-haiku",
        "display_name": "Claude 3.5 Haiku (via OpenRouter)",
        "capabilities": ["chat"],
        "input_cost_per_mtok": 80, "output_cost_per_mtok": 400, "max_context": 200000,
    },
    {
        "provider_slug": "openrouter", "slug": "meta-llama/llama-3.2-11b-vision-instruct",
        "display_name": "Llama 3.2 11B Vision (via OpenRouter)",
        "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 5, "output_cost_per_mtok": 5, "max_context": 128000,
    },
    # Ollama (custo zero — infra local)
    {
        "provider_slug": "ollama", "slug": "llama3.2:3b",
        "display_name": "Llama 3.2 3B (local)", "capabilities": ["chat"],
        "input_cost_per_mtok": 0, "output_cost_per_mtok": 0, "max_context": 128000,
    },
    {
        "provider_slug": "ollama", "slug": "llava:7b",
        "display_name": "LLaVA 7B (local)", "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 0, "output_cost_per_mtok": 0, "max_context": 4096,
    },
    {
        "provider_slug": "ollama", "slug": "nomic-embed-text",
        "display_name": "Nomic Embed Text (local)", "capabilities": ["embed_text"],
        "input_cost_per_mtok": 0, "output_cost_per_mtok": 0, "max_context": 8192,
    },
]

# Prompts versão 1 — placeholders. As operations em runtime usam os textos
# hardcoded do Python; esses ficam aqui pra SYS admin conseguir ver/editar
# no futuro (carregamento dinâmico entra em F3).
PROMPTS = [
    {"slug": "improve_text", "version": 1,
     "description": "Polir texto mantendo sentido (formal/neutral/concise/friendly)"},
    {"slug": "summarize", "version": 1,
     "description": "Sumarizar texto longo preservando fatos importantes"},
    {"slug": "classify", "version": 1,
     "description": "Classificar texto em lista de rótulos (retorna label + confidence)"},
    {"slug": "extract_patient_document", "version": 1,
     "description": "Extrair campos de documento de paciente via visão (RG/CNH/CPF/CNS)"},
]


def upgrade() -> None:
    bind = op.get_bind()

    # ── Providers ─────────────────────────────────────────────────────
    for prov in PROVIDERS:
        bind.execute(
            sa.text(
                """
                INSERT INTO app.ai_providers
                  (id, slug, display_name, sdk_kind, base_url_default, capabilities, active)
                VALUES
                  (:id, :slug, :display_name, :sdk_kind, :base_url, :caps, true)
                ON CONFLICT (slug) DO NOTHING
                """
            ).bindparams(sa.bindparam("caps", type_=sa.ARRAY(sa.String()))),
            {
                "id": str(uuid.uuid4()),
                "slug": prov["slug"],
                "display_name": prov["display_name"],
                "sdk_kind": prov["sdk_kind"],
                "base_url": prov["base_url_default"],
                "caps": list(prov["capabilities"]),
            },
        )

    # ── Models ────────────────────────────────────────────────────────
    for m in MODELS:
        prov_id = bind.execute(
            sa.text("SELECT id FROM app.ai_providers WHERE slug = :slug"),
            {"slug": m["provider_slug"]},
        ).scalar()
        if not prov_id:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO app.ai_models
                  (id, provider_id, slug, display_name, capabilities,
                   input_cost_per_mtok, output_cost_per_mtok, max_context, active)
                VALUES
                  (:id, :prov, :slug, :display_name, :caps,
                   :inc, :outc, :mctx, true)
                ON CONFLICT (provider_id, slug) DO NOTHING
                """
            ).bindparams(sa.bindparam("caps", type_=sa.ARRAY(sa.String()))),
            {
                "id": str(uuid.uuid4()),
                "prov": prov_id,
                "slug": m["slug"],
                "display_name": m["display_name"],
                "caps": list(m["capabilities"]),
                "inc": m["input_cost_per_mtok"],
                "outc": m["output_cost_per_mtok"],
                "mctx": m["max_context"],
            },
        )

    # ── Prompts (body placeholder — atualizado via SYS admin) ────────
    for p in PROMPTS:
        bind.execute(
            sa.text(
                """
                INSERT INTO app.ai_prompt_templates
                  (id, slug, version, body, description, active)
                VALUES
                  (:id, :slug, :version, :body, :descr, true)
                ON CONFLICT (slug, version) DO NOTHING
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "slug": p["slug"],
                "version": p["version"],
                "body": (
                    f"[Placeholder — o body real vive no código da operation "
                    f"{p['slug']} v{p['version']}. Edite aqui quando o "
                    f"carregamento dinâmico de prompts entrar em F3.]"
                ),
                "descr": p["description"],
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM app.ai_prompt_templates"))
    bind.execute(sa.text("DELETE FROM app.ai_models"))
    bind.execute(sa.text("DELETE FROM app.ai_providers"))
