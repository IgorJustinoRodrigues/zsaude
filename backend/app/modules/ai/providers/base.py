"""Abstrações do gateway de IA — DTOs internos + classe base de provider.

Módulos consumidores nunca tocam esses tipos direto; eles falam com
``AIService.run_operation(...)``. Os DTOs aqui servem pra tradução
provider ↔ formato interno.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal


# ─── Capabilities canônicas ───────────────────────────────────────────────────

CHAT = "chat"
CHAT_VISION = "chat_vision"
EMBED_TEXT = "embed_text"
EMBED_IMAGE = "embed_image"
TRANSCRIBE = "transcribe"

ALL_CAPABILITIES: set[str] = {CHAT, CHAT_VISION, EMBED_TEXT, EMBED_IMAGE, TRANSCRIBE}


# ─── DTOs ─────────────────────────────────────────────────────────────────────


@dataclass
class ContentPart:
    """Parte de uma mensagem — texto ou imagem (URL/data URL)."""

    kind: Literal["text", "image"]
    text: str | None = None
    image_url: str | None = None  # https://... ou data:image/jpeg;base64,...
    # OpenAI vision: "auto" | "low" | "high". "low" força 512px e consome
    # ~85 tokens em vez de milhares — ideal pra documentos legíveis.
    image_detail: str | None = None


@dataclass
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    # String simples ou lista de parts (necessário pra vision).
    content: str | list[ContentPart]


@dataclass
class ChatRequest:
    messages: list[ChatMessage]
    temperature: float = 0.2
    max_tokens: int | None = None
    # Schema JSON pra saída estruturada (se provider suportar).
    response_schema: dict[str, Any] | None = None


@dataclass
class ChatResponse:
    text: str
    tokens_in: int
    tokens_out: int
    finish_reason: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class EmbedRequest:
    inputs: list[str]
    # Dimensão opcional (alguns modelos permitem reduzir).
    dimensions: int | None = None


@dataclass
class EmbedResponse:
    vectors: list[list[float]]
    tokens_in: int


# ─── Erros ────────────────────────────────────────────────────────────────────


class ProviderError(Exception):
    """Erro ao executar no provider. ``retriable`` indica se failover/retry ajuda."""

    def __init__(self, message: str, *, code: str = "provider_error", retriable: bool = True):
        super().__init__(message)
        self.code = code
        self.retriable = retriable


class ProviderCapabilityError(ProviderError):
    """Provider não suporta a capability solicitada."""

    def __init__(self, provider_slug: str, capability: str):
        super().__init__(
            f"Provider '{provider_slug}' não suporta capability '{capability}'.",
            code="unsupported_capability",
            retriable=False,
        )


# ─── Base class ───────────────────────────────────────────────────────────────


@dataclass
class ProviderCredentials:
    """Tudo que o provider precisa pra fazer a chamada, já decifrado."""

    api_key: str
    base_url: str  # resolvido (override da chave ou default do catálogo)


class AIProvider(ABC):
    """Contrato comum. Implementações traduzem os DTOs internos pro formato do provider."""

    slug: str = ""  # override em subclasses

    @abstractmethod
    async def chat(
        self,
        req: ChatRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> ChatResponse: ...

    async def chat_stream(
        self,
        req: ChatRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> AsyncIterator[str]:
        """Streaming de texto token-a-token. Default: fallback pro chat
        normal e yield do texto completo de uma vez. Providers que suportam
        streaming nativo (OpenAI, Anthropic) sobrescrevem."""
        resp = await self.chat(req, model=model, creds=creds)
        yield resp.text

    @abstractmethod
    async def embed(
        self,
        req: EmbedRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> EmbedResponse: ...
