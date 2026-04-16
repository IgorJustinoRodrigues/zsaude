"""Provider OpenAI.

Usa o SDK oficial `openai` com `AsyncOpenAI`. Mesmo cliente atende OpenAI
e OpenRouter (que é OpenAI-compatible) — OpenRouter herda desta classe e
só troca a base_url default.

``creds.base_url`` pode ser None (usa default do SDK = api.openai.com) ou
override vindo do catálogo/chave do município.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

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


def _content_to_openai(content: str | list[ContentPart]) -> str | list[dict]:
    """Traduz content interno pro formato aceito pelo SDK OpenAI."""
    if isinstance(content, str):
        return content
    parts: list[dict] = []
    for p in content:
        if p.kind == "text":
            parts.append({"type": "text", "text": p.text or ""})
        elif p.kind == "image":
            img: dict = {"url": p.image_url or ""}
            if p.image_detail:
                img["detail"] = p.image_detail
            parts.append({"type": "image_url", "image_url": img})
    return parts


def _msg_to_openai(m: ChatMessage) -> dict:
    return {"role": m.role, "content": _content_to_openai(m.content)}


class OpenAIProvider(AIProvider):
    slug = "openai"

    async def chat(
        self,
        req: ChatRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> ChatResponse:
        # Import interno: manter o SDK fora do path de importação até precisar.
        from openai import AsyncOpenAI
        from openai import APIError as OpenAIAPIError
        from openai import APIConnectionError, RateLimitError

        client = AsyncOpenAI(
            api_key=creds.api_key,
            base_url=creds.base_url or None,
        )

        kwargs: dict = {
            "model": model,
            "messages": [_msg_to_openai(m) for m in req.messages],
            "temperature": req.temperature,
        }
        if req.max_tokens is not None:
            kwargs["max_tokens"] = req.max_tokens
        if req.response_schema is not None:
            # JSON mode pra saída estruturada. Provider OpenRouter também aceita.
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "response",
                    "schema": req.response_schema,
                    "strict": True,
                },
            }

        try:
            resp = await client.chat.completions.create(**kwargs)
        except RateLimitError as e:
            raise ProviderError(str(e), code="rate_limit", retriable=True) from e
        except APIConnectionError as e:
            raise ProviderError(str(e), code="connection_error", retriable=True) from e
        except OpenAIAPIError as e:
            # Status 4xx de auth/param são não-retriable; 5xx sim.
            status = getattr(e, "status_code", 0) or 0
            retriable = status >= 500 or status == 408
            raise ProviderError(str(e), code=f"http_{status}", retriable=retriable) from e

        choice = resp.choices[0]
        usage = resp.usage
        return ChatResponse(
            text=choice.message.content or "",
            tokens_in=(usage.prompt_tokens if usage else 0) or 0,
            tokens_out=(usage.completion_tokens if usage else 0) or 0,
            finish_reason=choice.finish_reason or "",
            raw={},  # não guardar payload (LGPD — ver plano)
        )

    async def chat_stream(
        self,
        req: ChatRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> AsyncIterator[str]:
        from openai import AsyncOpenAI
        from openai import APIError as OpenAIAPIError
        from openai import APIConnectionError, RateLimitError

        client = AsyncOpenAI(
            api_key=creds.api_key,
            base_url=creds.base_url or None,
        )

        kwargs: dict = {
            "model": model,
            "messages": [_msg_to_openai(m) for m in req.messages],
            "temperature": req.temperature,
            "stream": True,
        }
        if req.max_tokens is not None:
            kwargs["max_tokens"] = req.max_tokens

        try:
            stream = await client.chat.completions.create(**kwargs)
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
        except RateLimitError as e:
            raise ProviderError(str(e), code="rate_limit", retriable=True) from e
        except APIConnectionError as e:
            raise ProviderError(str(e), code="connection_error", retriable=True) from e
        except OpenAIAPIError as e:
            status = getattr(e, "status_code", 0) or 0
            raise ProviderError(str(e), code=f"http_{status}", retriable=status >= 500) from e

    async def embed(
        self,
        req: EmbedRequest,
        *,
        model: str,
        creds: ProviderCredentials,
    ) -> EmbedResponse:
        from openai import AsyncOpenAI
        from openai import APIError as OpenAIAPIError
        from openai import APIConnectionError, RateLimitError

        client = AsyncOpenAI(
            api_key=creds.api_key,
            base_url=creds.base_url or None,
        )

        kwargs: dict = {"model": model, "input": req.inputs}
        if req.dimensions is not None:
            kwargs["dimensions"] = req.dimensions

        try:
            resp = await client.embeddings.create(**kwargs)
        except RateLimitError as e:
            raise ProviderError(str(e), code="rate_limit", retriable=True) from e
        except APIConnectionError as e:
            raise ProviderError(str(e), code="connection_error", retriable=True) from e
        except OpenAIAPIError as e:
            status = getattr(e, "status_code", 0) or 0
            retriable = status >= 500 or status == 408
            raise ProviderError(str(e), code=f"http_{status}", retriable=retriable) from e

        return EmbedResponse(
            vectors=[d.embedding for d in resp.data],
            tokens_in=(resp.usage.prompt_tokens if resp.usage else 0) or 0,
        )
