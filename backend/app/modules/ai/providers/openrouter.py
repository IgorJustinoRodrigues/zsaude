"""Provider OpenRouter — wrapper do OpenAIProvider com base_url fixa.

Como OpenRouter é API OpenAI-compatible, herda tudo do OpenAIProvider.
Só força uma base_url default se o caller não passou (override ainda
pode vir da chave do município).
"""

from __future__ import annotations

from app.modules.ai.providers.openai import OpenAIProvider
from app.modules.ai.providers.base import (
    ChatRequest,
    ChatResponse,
    EmbedRequest,
    EmbedResponse,
    ProviderCredentials,
)

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"


class OpenRouterProvider(OpenAIProvider):
    slug = "openrouter"

    async def chat(
        self,
        req: ChatRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> ChatResponse:
        return await super().chat(req, model=model, creds=self._ensure_base(creds))

    async def embed(
        self,
        req: EmbedRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> EmbedResponse:
        return await super().embed(req, model=model, creds=self._ensure_base(creds))

    @staticmethod
    def _ensure_base(creds: ProviderCredentials) -> ProviderCredentials:
        if creds.base_url:
            return creds
        return ProviderCredentials(api_key=creds.api_key, base_url=_OPENROUTER_BASE)
