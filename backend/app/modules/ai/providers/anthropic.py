"""Provider Anthropic (Messages API nativa).

Usa o SDK ``anthropic`` oficial. Estrutura de mensagens diferente do OpenAI:
- System prompt vai em ``system`` param, não como message com role=system.
- Imagens em ``source`` block com ``type='base64'`` e media_type.
"""

from __future__ import annotations

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


def _content_to_anthropic(content: str | list[ContentPart]) -> list[dict]:
    """Traduz content interno pro formato Anthropic Messages API."""
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    parts: list[dict] = []
    for p in content:
        if p.kind == "text":
            parts.append({"type": "text", "text": p.text or ""})
        elif p.kind == "image" and p.image_url:
            url = p.image_url or ""
            if url.startswith("data:") and "," in url:
                header, b64 = url.split(",", 1)
                media_type = header.split(":")[1].split(";")[0] if ":" in header else "image/jpeg"
                parts.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": b64,
                    },
                })
            else:
                parts.append({
                    "type": "image",
                    "source": {"type": "url", "url": url},
                })
    return parts


class AnthropicProvider(AIProvider):
    slug = "anthropic"

    async def chat(
        self,
        req: ChatRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> ChatResponse:
        from anthropic import AsyncAnthropic
        from anthropic import APIError as AnthropicAPIError
        from anthropic import APIConnectionError as AnthropicConnError
        from anthropic import RateLimitError as AnthropicRateLimit

        client = AsyncAnthropic(
            api_key=creds.api_key,
            base_url=creds.base_url or None,
        )

        # Anthropic separa system do messages. Extrair.
        system_text = ""
        messages: list[dict] = []
        for m in req.messages:
            if m.role == "system":
                system_text += (m.content if isinstance(m.content, str) else
                                " ".join(p.text or "" for p in m.content if p.kind == "text"))
            else:
                messages.append({
                    "role": m.role,
                    "content": _content_to_anthropic(m.content),
                })

        kwargs: dict = {
            "model": model,
            "messages": messages,
            "max_tokens": req.max_tokens or 4096,
        }
        if system_text:
            kwargs["system"] = system_text
        if req.temperature is not None:
            kwargs["temperature"] = req.temperature

        try:
            resp = await client.messages.create(**kwargs)
        except AnthropicRateLimit as e:
            raise ProviderError(str(e), code="rate_limit", retriable=True) from e
        except AnthropicConnError as e:
            raise ProviderError(str(e), code="connection_error", retriable=True) from e
        except AnthropicAPIError as e:
            status = getattr(e, "status_code", 0) or 0
            retriable = status >= 500 or status == 408 or status == 529
            raise ProviderError(str(e), code=f"http_{status}", retriable=retriable) from e

        text_out = ""
        for block in resp.content:
            if block.type == "text":
                text_out += block.text

        usage = resp.usage
        return ChatResponse(
            text=text_out,
            tokens_in=usage.input_tokens if usage else 0,
            tokens_out=usage.output_tokens if usage else 0,
            finish_reason=resp.stop_reason or "",
            raw={},
        )

    async def embed(
        self,
        req: EmbedRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> EmbedResponse:
        raise ProviderError(
            "Anthropic não oferece API de embeddings nativa.",
            code="unsupported_capability",
            retriable=False,
        )
