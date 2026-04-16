"""Adapters por provider de IA. Registra o mapeamento sdk_kind → classe."""

from __future__ import annotations

from app.modules.ai.models import AISdkKind
from app.modules.ai.providers.base import AIProvider
from app.modules.ai.providers.ollama import OllamaProvider
from app.modules.ai.providers.openai import OpenAIProvider
from app.modules.ai.providers.openrouter import OpenRouterProvider


_REGISTRY: dict[AISdkKind, AIProvider] = {
    AISdkKind.openai: OpenAIProvider(),
    AISdkKind.openrouter: OpenRouterProvider(),
    AISdkKind.ollama: OllamaProvider(),
}


def get_provider(sdk_kind: AISdkKind) -> AIProvider:
    """Instância singleton por sdk_kind. Levanta KeyError se não suportado."""
    try:
        return _REGISTRY[sdk_kind]
    except KeyError as e:
        raise KeyError(f"Provider SDK '{sdk_kind}' não implementado.") from e


__all__ = ["AIProvider", "get_provider"]
