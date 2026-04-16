"""Provider Ollama — local inference via HTTP.

API nativa (não OpenAI-compatible). Endpoints usados:
- POST /api/chat      → chat completion
- POST /api/embed     → embeddings (Ollama ≥0.2.0)

``base_url`` tipicamente é ``http://localhost:11434`` ou ``http://ollama:11434``
em Docker. ``api_key`` é aceito mas geralmente vazio (Ollama não valida).
"""

from __future__ import annotations

from typing import Any

import httpx

from app.modules.ai.providers.base import (
    AIProvider,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ContentPart,
    EmbedRequest,
    EmbedResponse,
    ProviderCredentials,
    ProviderError,
)

_DEFAULT_TIMEOUT = 120.0  # Ollama pode ser lento (CPU sem GPU)


def _content_to_ollama(content: str | list[ContentPart]) -> tuple[str, list[str]]:
    """Retorna (texto, images_base64). Ollama quer imagens em array separado."""
    if isinstance(content, str):
        return content, []
    text_buf: list[str] = []
    images: list[str] = []
    for p in content:
        if p.kind == "text":
            text_buf.append(p.text or "")
        elif p.kind == "image" and p.image_url:
            # data URL: extrai a parte base64. Ollama quer só o base64 bruto.
            url = p.image_url
            if url.startswith("data:") and "," in url:
                images.append(url.split(",", 1)[1])
            else:
                images.append(url)
    return "\n".join(text_buf), images


def _msg_to_ollama(m: ChatMessage) -> dict[str, Any]:
    text, images = _content_to_ollama(m.content)
    msg: dict[str, Any] = {"role": m.role, "content": text}
    if images:
        msg["images"] = images
    return msg


class OllamaProvider(AIProvider):
    slug = "ollama"

    async def chat(
        self,
        req: ChatRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> ChatResponse:
        url = f"{(creds.base_url or 'http://localhost:11434').rstrip('/')}/api/chat"
        payload: dict[str, Any] = {
            "model": model,
            "messages": [_msg_to_ollama(m) for m in req.messages],
            "stream": False,
            "options": {"temperature": req.temperature},
        }
        if req.max_tokens is not None:
            payload["options"]["num_predict"] = req.max_tokens
        if req.response_schema is not None:
            # Ollama >= 0.5 suporta format=json_schema.
            payload["format"] = req.response_schema

        try:
            async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            raise ProviderError(
                f"Ollama {status}: {e.response.text[:200]}",
                code=f"http_{status}",
                retriable=status >= 500,
            ) from e
        except httpx.HTTPError as e:
            raise ProviderError(str(e), code="connection_error", retriable=True) from e

        message = data.get("message", {}) or {}
        return ChatResponse(
            text=message.get("content", "") or "",
            tokens_in=int(data.get("prompt_eval_count", 0) or 0),
            tokens_out=int(data.get("eval_count", 0) or 0),
            finish_reason="stop" if data.get("done") else "",
            raw={},
        )

    async def embed(
        self,
        req: EmbedRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> EmbedResponse:
        url = f"{(creds.base_url or 'http://localhost:11434').rstrip('/')}/api/embed"
        payload: dict[str, Any] = {"model": model, "input": req.inputs}

        try:
            async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            raise ProviderError(
                f"Ollama {status}: {e.response.text[:200]}",
                code=f"http_{status}",
                retriable=status >= 500,
            ) from e
        except httpx.HTTPError as e:
            raise ProviderError(str(e), code="connection_error", retriable=True) from e

        vectors: list[list[float]] = data.get("embeddings") or []
        # Algumas versões devolvem "embedding" (singular) pra 1 input.
        if not vectors and "embedding" in data:
            vectors = [data["embedding"]]

        return EmbedResponse(
            vectors=vectors,
            tokens_in=int(data.get("prompt_eval_count", 0) or 0),
        )
