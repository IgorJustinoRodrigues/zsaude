"""Atualiza catálogo de IA pra 2026 (modelos novos + rotas fallback OpenAI).

Revision ID: 0047_ai_catalog_2026
Revises: 0046_fa_cnes_bindings
Create Date: 2026-04-20

Substitui o catálogo de modelos seedado em 2024-10 por um conjunto atual
(abril/2026) focado em **custo/performance pra conversação**:

**OpenRouter (roteador inteligente, barato):**
- ``google/gemini-2.0-flash-001``   — R$ 0,50/MTok in — melhor custo-benefício
- ``deepseek/deepseek-chat``        — super barato, bom pt-br
- ``openai/gpt-4o-mini`` via OR     — familiar, confiável
- ``meta-llama/llama-3.3-70b-instruct`` — open-weights moderno
- ``openai/gpt-4.1-mini`` via OR    — próxima geração mini
- ``anthropic/claude-3.5-haiku``    — raciocínio rápido
- ``google/gemini-pro-1.5``         — 2M contexto
- ``openai/gpt-4.1`` via OR         — premium econômico
- ``anthropic/claude-3.5-sonnet``   — top tier pra qualidade
- ``meta-llama/llama-3.2-11b-vision-instruct`` — visão barata

**OpenAI (direto — fallback confiável):**
- ``gpt-4o-mini``, ``gpt-4o``
- ``gpt-4.1-mini``, ``gpt-4.1``     — 1M contexto
- ``o3-mini``                       — reasoning
- Embeddings: ``text-embedding-3-small`` / ``large``

**Rotas default redesenhadas** (chat e chat_vision ganham 3 níveis
de fallback; embed continua via OpenAI direto — cheapest + quality):

- ``chat``:        OR/Gemini-Flash → OR/DeepSeek → OpenAI/gpt-4o-mini
- ``chat_vision``: OR/Gemini-Flash → OR/gpt-4o-mini → OpenAI/gpt-4o-mini
- ``embed_text``:  OpenAI/text-embedding-3-small

Isso garante que, se a OpenRouter cair (ou a chave bloqueada), o sistema
automaticamente usa a chave OpenAI direta do usuário — sem interrupção.

Estratégia: limpa ``ai_capability_routes`` e ``ai_models`` (providers
permanecem, chaves por município também) e reseeda do zero.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0047_ai_catalog_2026"
down_revision: str | None = "0046_fa_cnes_bindings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Todos os custos em CENTAVOS de USD por 1M tokens (1 unidade = 1 cent / MTok).
#
# Formato: (provider_slug, model_slug, display_name, capabilities, in, out, ctx)
MODELS: list[tuple[str, str, str, list[str], int, int, int]] = [
    # ── OpenAI (direto) ───────────────────────────────────────────────────
    ("openai", "gpt-4o-mini",               "GPT-4o mini",              ["chat", "chat_vision"],   15,   60,   128_000),
    ("openai", "gpt-4o",                    "GPT-4o",                   ["chat", "chat_vision"],  250, 1000,   128_000),
    ("openai", "gpt-4.1-mini",              "GPT-4.1 mini",             ["chat", "chat_vision"],   40,  160, 1_000_000),
    ("openai", "gpt-4.1",                   "GPT-4.1",                  ["chat", "chat_vision"],  200,  800, 1_000_000),
    ("openai", "o3-mini",                   "o3-mini (reasoning)",      ["chat"],                 110,  440,   200_000),
    ("openai", "text-embedding-3-small",    "Text Embedding 3 Small",   ["embed_text"],             2,    0,     8_192),
    ("openai", "text-embedding-3-large",    "Text Embedding 3 Large",   ["embed_text"],            13,    0,     8_192),

    # ── OpenRouter (roteador OpenAI-compatible) ───────────────────────────
    ("openrouter", "google/gemini-2.0-flash-001",         "Gemini 2.0 Flash",              ["chat", "chat_vision"],  10,   40, 1_048_576),
    ("openrouter", "deepseek/deepseek-chat",              "DeepSeek V3",                    ["chat"],                 14,   28,   131_072),
    ("openrouter", "openai/gpt-4o-mini",                  "GPT-4o mini (via OpenRouter)",  ["chat", "chat_vision"],  15,   60,   128_000),
    ("openrouter", "meta-llama/llama-3.3-70b-instruct",   "Llama 3.3 70B Instruct",        ["chat"],                 20,   30,   131_072),
    ("openrouter", "openai/gpt-4.1-mini",                 "GPT-4.1 mini (via OpenRouter)", ["chat", "chat_vision"],  40,  160, 1_000_000),
    ("openrouter", "anthropic/claude-3.5-haiku",          "Claude 3.5 Haiku",              ["chat", "chat_vision"],  80,  400,   200_000),
    ("openrouter", "google/gemini-pro-1.5",               "Gemini 1.5 Pro",                ["chat", "chat_vision"], 125,  500, 2_097_152),
    ("openrouter", "openai/gpt-4.1",                      "GPT-4.1 (via OpenRouter)",      ["chat", "chat_vision"], 200,  800, 1_000_000),
    ("openrouter", "anthropic/claude-3.5-sonnet",         "Claude 3.5 Sonnet",             ["chat", "chat_vision"], 300, 1500,   200_000),
    ("openrouter", "meta-llama/llama-3.2-11b-vision-instruct", "Llama 3.2 11B Vision",     ["chat_vision"],           5,    5,   128_000),

    # ── Ollama (local — sem rota default; admin pluga se quiser) ──────────
    ("ollama", "llama3.2:3b",        "Llama 3.2 3B (local)",    ["chat"],                0, 0, 128_000),
    ("ollama", "llava:7b",           "LLaVA 7B (local)",        ["chat", "chat_vision"], 0, 0,   4_096),
    ("ollama", "nomic-embed-text",   "Nomic Embed (local)",     ["embed_text"],          0, 0,   8_192),
]


# Rotas default (todas scope=global, sem município/módulo).
# Menor priority = maior prioridade (service itera em ordem crescente).
#
# Formato: (capability, priority, provider_slug, model_slug)
ROUTES: list[tuple[str, int, str, str]] = [
    # Chat: Gemini Flash (~1/15 do GPT-4o-mini) → DeepSeek (ainda mais
    # barato) → OpenAI direto como último fallback.
    ("chat",        0, "openrouter", "google/gemini-2.0-flash-001"),
    ("chat",        1, "openrouter", "deepseek/deepseek-chat"),
    ("chat",        2, "openai",     "gpt-4o-mini"),

    # Chat com visão: Gemini Flash já é multimodal → GPT-4o-mini via OR
    # → GPT-4o-mini direto.
    ("chat_vision", 0, "openrouter", "google/gemini-2.0-flash-001"),
    ("chat_vision", 1, "openrouter", "openai/gpt-4o-mini"),
    ("chat_vision", 2, "openai",     "gpt-4o-mini"),

    # Embeddings: OpenAI é cheap enough ($0.02/MTok) e precisa de
    # modelo estável pra vetor — sem fallback automático (se cair,
    # retorna erro; índices semânticos tomam decisão explícita).
    ("embed_text",  0, "openai",     "text-embedding-3-small"),
]


def upgrade() -> None:
    # 1. Limpa catálogo operacional (rotas e modelos). Providers permanecem
    #    porque AIMunicipalityKey os referencia (chaves do usuário).
    op.execute("DELETE FROM app.ai_capability_routes")
    op.execute("DELETE FROM app.ai_models")

    conn = op.get_bind()
    providers = {
        slug: pid
        for slug, pid in conn.execute(
            sa.text("SELECT slug, id FROM app.ai_providers")
        ).fetchall()
    }

    # 2. Insere novos modelos e coleta IDs pra rotas.
    model_ids: dict[tuple[str, str], uuid.UUID] = {}
    for provider_slug, slug, display, caps, cin, cout, ctx in MODELS:
        pid = providers.get(provider_slug)
        if pid is None:
            continue  # provider foi removido do DB — ignora model órfão
        mid = uuid.uuid4()
        conn.execute(
            sa.text(
                "INSERT INTO app.ai_models "
                "(id, provider_id, slug, display_name, capabilities, "
                " input_cost_per_mtok, output_cost_per_mtok, max_context, active) "
                "VALUES (:id, :pid, :slug, :name, :caps, :cin, :cout, :ctx, TRUE)"
            ),
            {
                "id": mid, "pid": pid, "slug": slug, "name": display,
                "caps": caps, "cin": cin, "cout": cout, "ctx": ctx,
            },
        )
        model_ids[(provider_slug, slug)] = mid

    # 3. Insere rotas default.
    for capability, priority, provider_slug, model_slug in ROUTES:
        mid = model_ids.get((provider_slug, model_slug))
        if mid is None:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO app.ai_capability_routes "
                "(id, scope, capability, model_id, priority, active) "
                "VALUES (:id, 'global', :cap, :mid, :prio, TRUE)"
            ),
            {
                "id": uuid.uuid4(),
                "cap": capability,
                "mid": mid,
                "prio": priority,
            },
        )


def downgrade() -> None:
    # Limpa sem reverter pro seed antigo — admin reconfigura se quiser.
    op.execute("DELETE FROM app.ai_capability_routes")
    op.execute("DELETE FROM app.ai_models")
