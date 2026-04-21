"""Provider OpenRouter — wrapper do OpenAIProvider com base_url + headers.

OpenRouter é API OpenAI-compatible, então herdamos tudo do OpenAIProvider.
Porém a API deles exige dois headers em todas as chamadas:

- ``HTTP-Referer``: URL do app (usada para ranking e identificação).
- ``X-Title``: nome legível do app (aparece no dashboard deles).

Sem esses headers o app fica invisível no ranking, tem rate-limits mais
rígidos e pode sofrer priorização menor no roteamento da OpenRouter.
"""

from __future__ import annotations

from app.core.config import settings
from app.modules.ai.providers.base import ProviderCredentials
from app.modules.ai.providers.openai import OpenAIProvider

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_APP_TITLE = "zSaude"


class OpenRouterProvider(OpenAIProvider):
    slug = "openrouter"

    def _make_client(self, creds: ProviderCredentials):
        from openai import AsyncOpenAI

        base = creds.base_url or _OPENROUTER_BASE
        return AsyncOpenAI(
            api_key=creds.api_key,
            base_url=base,
            default_headers={
                "HTTP-Referer": settings.app_public_url,
                "X-Title": _APP_TITLE,
            },
        )
