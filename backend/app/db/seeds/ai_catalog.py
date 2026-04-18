"""Seed mínimo do catálogo de IA (providers, modelos, prompts, rotas).

Garante que o sistema responde a ``capability`` requests de IA logo após
o bootstrap. Admin amplia o catálogo via UI.

Inclui:
- 3 providers (openai, openrouter, ollama)
- 5 modelos iniciais (2 OpenAI + 2 OpenRouter + 1 Ollama local)
- 4 prompts placeholder (improve_text, summarize, classify, extract_patient_document)
- 3 rotas globais (chat, chat_vision, embed_text → OpenAI mini models)

Idempotente via upsert por slug/versão.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dialect import get_adapter
from app.db.types import new_uuid7
from app.modules.ai.models import (
    AICapabilityRoute,
    AIModel,
    AIPromptTemplate,
    AIProvider,
)


# ── Providers ───────────────────────────────────────────────────────────────

PROVIDERS: list[dict] = [
    {
        "slug": "openai",
        "display_name": "OpenAI",
        "sdk_kind": "openai",
        "base_url_default": " ",
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


# ── Models (custo em cents por 1M tokens) ───────────────────────────────────

MODELS: list[dict] = [
    {
        "provider_slug": "openai", "slug": "gpt-4o-mini",
        "display_name": "GPT-4o mini", "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 15, "output_cost_per_mtok": 60, "max_context": 128000,
    },
    {
        "provider_slug": "openai", "slug": "text-embedding-3-small",
        "display_name": "Text Embedding 3 Small", "capabilities": ["embed_text"],
        "input_cost_per_mtok": 2, "output_cost_per_mtok": 0, "max_context": 8192,
    },
    {
        "provider_slug": "openrouter", "slug": "google/gemini-2.0-flash-exp:free",
        "display_name": "Gemini 2.0 Flash (free)", "capabilities": ["chat", "chat_vision"],
        "input_cost_per_mtok": 0, "output_cost_per_mtok": 0, "max_context": 1048576,
    },
    {
        "provider_slug": "openrouter", "slug": "anthropic/claude-3.5-haiku",
        "display_name": "Claude 3.5 Haiku", "capabilities": ["chat"],
        "input_cost_per_mtok": 80, "output_cost_per_mtok": 400, "max_context": 200000,
    },
    {
        "provider_slug": "ollama", "slug": "llama3.2:3b",
        "display_name": "Llama 3.2 3B (local)", "capabilities": ["chat"],
        "input_cost_per_mtok": 0, "output_cost_per_mtok": 0, "max_context": 128000,
    },
]


# ── Prompts (placeholder v1) ────────────────────────────────────────────────

PROMPTS: list[dict] = [
    {
        "slug": "improve_text", "version": 1,
        "description": "Polir texto mantendo sentido (formal/neutral/concise/friendly)",
        "body": "Você é um revisor. Polir o texto mantendo o significado original.",
    },
    {
        "slug": "summarize", "version": 1,
        "description": "Sumarizar texto longo preservando fatos importantes",
        "body": "Sumarize o texto abaixo, preservando fatos importantes.",
    },
    {
        "slug": "classify", "version": 1,
        "description": "Classificar texto em lista de rótulos",
        "body": "Classifique o texto entre os rótulos fornecidos.",
    },
    {
        "slug": "extract_patient_document", "version": 1,
        "description": "Extrair campos de documento de paciente via visão",
        "body": "Extraia os campos estruturados do documento (RG/CNH/CPF/CNS).",
    },
]


# ── Rotas globais (capability → modelo) ─────────────────────────────────────

# Modelo default por capability. Admin pode adicionar por município via UI.
ROUTES: list[dict] = [
    {"capability": "chat",        "model_slug": "gpt-4o-mini"},
    {"capability": "chat_vision", "model_slug": "gpt-4o-mini"},
    {"capability": "embed_text",  "model_slug": "text-embedding-3-small"},
]


async def apply(session: AsyncSession) -> int:
    """Aplica providers, modelos, prompts e rotas globais. Idempotente."""
    adapter = get_adapter(session.bind.dialect.name)
    count = 0

    # Providers
    provider_values = [
        {
            "id": new_uuid7(),
            "slug": p["slug"],
            "display_name": p["display_name"],
            "sdk_kind": p["sdk_kind"],
            "base_url_default": p["base_url_default"],
            "capabilities": p["capabilities"],
            "active": True,
        }
        for p in PROVIDERS
    ]
    await adapter.execute_upsert(
        session, AIProvider, provider_values,
        index_elements=["slug"],
        update_columns=["display_name", "sdk_kind", "base_url_default", "capabilities", "active"],
    )
    count += len(provider_values)
    await session.flush()

    # Resolve provider IDs
    prov_rows = (await session.execute(
        select(AIProvider.slug, AIProvider.id)
    )).all()
    prov_id_by_slug = {slug: pid for slug, pid in prov_rows}

    # Models
    model_values = []
    for m in MODELS:
        pid = prov_id_by_slug.get(m["provider_slug"])
        if pid is None:
            continue
        model_values.append({
            "id": new_uuid7(),
            "provider_id": pid,
            "slug": m["slug"],
            "display_name": m["display_name"],
            "capabilities": m["capabilities"],
            "input_cost_per_mtok": m["input_cost_per_mtok"],
            "output_cost_per_mtok": m["output_cost_per_mtok"],
            "max_context": m["max_context"],
            "active": True,
        })
    if model_values:
        await adapter.execute_upsert(
            session, AIModel, model_values,
            index_elements=["provider_id", "slug"],
            update_columns=["display_name", "capabilities", "input_cost_per_mtok",
                            "output_cost_per_mtok", "max_context", "active"],
        )
        count += len(model_values)
    await session.flush()

    # Prompts
    prompt_values = [
        {
            "id": new_uuid7(),
            "slug": p["slug"],
            "version": p["version"],
            "body": p["body"],
            "description": p["description"],
            "active": True,
        }
        for p in PROMPTS
    ]
    await adapter.execute_upsert(
        session, AIPromptTemplate, prompt_values,
        index_elements=["slug", "version"],
        update_columns=["body", "description", "active"],
    )
    count += len(prompt_values)
    await session.flush()

    # Capability routes — só global. Checa se já existe pra não duplicar.
    # (CheckConstraint obriga scope='global' a ter mun_id/module NULL).
    for r in ROUTES:
        model = await session.scalar(
            select(AIModel).where(AIModel.slug == r["model_slug"]),
        )
        if model is None:
            continue
        existing = await session.scalar(
            select(AICapabilityRoute).where(
                AICapabilityRoute.scope == "global",
                AICapabilityRoute.capability == r["capability"],
                AICapabilityRoute.municipality_id.is_(None),
                AICapabilityRoute.module_code.is_(None),
            ),
        )
        if existing is None:
            session.add(AICapabilityRoute(
                scope="global",
                municipality_id=None,
                module_code=None,
                capability=r["capability"],
                model_id=model.id,
                priority=0,
                active=True,
            ))
            count += 1

    await session.flush()
    return count
