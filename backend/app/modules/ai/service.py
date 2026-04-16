"""AIService — orquestração de rotas, providers e logs.

Responsabilidades:
- Resolver rota para uma capability (escopo module > municipality > global)
- Iterar fallbacks por priority
- Checar circuit breaker
- Decifrar chave via crypto.decrypt_secret
- Chamar provider, medir latência
- Congelar preço no log, persistir usage log
- Registrar sucesso/erro no circuit
- Retornar resultado ou levantar AIServiceError se tudo falhou

Módulos NÃO chamam AIService.chat/embed diretamente — usam ``operations``
(ex: ``from app.modules.ai.operations import improve_text; await improve_text.run(...)``).
A operation constrói o ChatRequest/EmbedRequest e delega pro service.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import CryptoError, decrypt_secret
from app.modules.ai import circuit, pii, quota
from app.modules.ai.costs import compute_cost_cents
from app.modules.ai.models import (
    AICapabilityRoute,
    AIModel,
    AIMunicipalityKey,
    AIProvider,
    AIRouteScope,
    AIUsageLog,
)
from app.modules.ai.providers import get_provider
from collections.abc import AsyncIterator

from app.modules.ai.providers.base import (
    ChatRequest,
    ChatResponse,
    EmbedRequest,
    EmbedResponse,
    ProviderCredentials,
    ProviderError,
)

if TYPE_CHECKING:
    from app.core.deps import WorkContext

log = logging.getLogger(__name__)


# ─── Erros públicos ───────────────────────────────────────────────────────────


class AIServiceError(Exception):
    """Todas as rotas falharam ou nenhuma foi encontrada."""

    def __init__(self, message: str, *, code: str = "ai_error"):
        super().__init__(message)
        self.code = code


class NoRouteError(AIServiceError):
    """Nenhuma rota ativa para a capability pedida."""

    def __init__(self, capability: str):
        super().__init__(f"Nenhuma rota configurada para capability '{capability}'.", code="no_route")


class NoKeyError(AIServiceError):
    def __init__(self, provider_slug: str):
        super().__init__(
            f"Chave do provider '{provider_slug}' não configurada no município nem globalmente.",
            code="no_key",
        )


# ─── Estruturas internas ──────────────────────────────────────────────────────


@dataclass
class _ResolvedRoute:
    """Rota + modelo + provider já hidratados pra execução."""

    route: AICapabilityRoute
    model: AIModel
    provider: AIProvider  # entidade do catálogo
    scope_label: str  # "module"|"municipality"|"global" (pra telemetria)


# ─── Fingerprint (LGPD-safe) ──────────────────────────────────────────────────


def _fingerprint_chat(req: ChatRequest) -> str:
    """Hash sha256 canônico das mensagens + params. Sem payload persistido."""
    canon = json.dumps(
        {
            "messages": [
                {"role": m.role, "content": _content_canonical(m.content)}
                for m in req.messages
            ],
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
            "schema_hash": _schema_hash(req.response_schema),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def _content_canonical(c):
    if isinstance(c, str):
        return c
    return [{"kind": p.kind, "text": p.text, "image_url": p.image_url} for p in c]


def _schema_hash(schema: dict | None) -> str:
    if not schema:
        return ""
    return hashlib.sha256(
        json.dumps(schema, sort_keys=True).encode("utf-8")
    ).hexdigest()[:16]


def _fingerprint_embed(req: EmbedRequest) -> str:
    canon = json.dumps(
        {"inputs": req.inputs, "dimensions": req.dimensions},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


# ─── Service ──────────────────────────────────────────────────────────────────


class AIService:
    """Service stateless por request. Não armazena resultado entre chamadas."""

    def __init__(self, db: AsyncSession, ctx: "WorkContext | None" = None):
        self.db = db
        self.ctx = ctx
        self.municipality_id: UUID | None = ctx.municipality_id if ctx else None
        self.user_id: UUID | None = ctx.user_id if ctx else None

    # ── APIs públicas (chamadas pelas operations) ───────────────────────

    async def call_chat(
        self,
        req: ChatRequest,
        *,
        capability: str,  # "chat" ou "chat_vision"
        module_code: str,
        operation_slug: str,
        prompt_template: tuple[str, int] | None = None,
        idempotency_key: str | None = None,
    ) -> ChatResponse:
        async def _exec(route: _ResolvedRoute, creds: ProviderCredentials):
            provider_impl = get_provider(route.provider.sdk_kind)
            # PII redaction: mascara CPF/CNS/telefone/email antes de enviar
            # pro provider externo (não aplica em Ollama/local).
            safe_req = ChatRequest(
                messages=pii.redact_messages(req.messages, route.provider.sdk_kind),
                temperature=req.temperature,
                max_tokens=req.max_tokens,
                response_schema=req.response_schema,
            )
            return await provider_impl.chat(safe_req, model=route.model.slug, creds=creds)

        return await self._execute(
            capability=capability,
            module_code=module_code,
            operation_slug=operation_slug,
            prompt_template=prompt_template,
            idempotency_key=idempotency_key,
            fingerprint=_fingerprint_chat(req),
            exec_fn=_exec,
        )

    async def call_embed(
        self,
        req: EmbedRequest,
        *,
        module_code: str,
        operation_slug: str,
        capability: str = "embed_text",
        prompt_template: tuple[str, int] | None = None,
        idempotency_key: str | None = None,
    ) -> EmbedResponse:
        async def _exec(route: _ResolvedRoute, creds: ProviderCredentials):
            provider_impl = get_provider(route.provider.sdk_kind)
            return await provider_impl.embed(req, model=route.model.slug, creds=creds)

        return await self._execute(
            capability=capability,
            module_code=module_code,
            operation_slug=operation_slug,
            prompt_template=prompt_template,
            idempotency_key=idempotency_key,
            fingerprint=_fingerprint_embed(req),
            exec_fn=_exec,
        )

    async def stream_chat(
        self,
        req: ChatRequest,
        *,
        capability: str = "chat",
        module_code: str,
        operation_slug: str,
    ) -> AsyncIterator[str]:
        """Streaming token-a-token. Resolve rota, faz quota check, e
        delega pro ``chat_stream`` do provider. Loga uso estimado no final.

        Não faz failover entre rotas (streaming não é re-tentável mid-stream).
        """
        routes = await self._resolve_routes(capability, module_code)
        if not routes:
            raise NoRouteError(capability)

        await quota.check_quota(self.db, self.municipality_id)

        resolved = routes[0]
        creds = await self._resolve_credentials(resolved)
        if creds is None:
            raise NoKeyError(resolved.provider.slug)

        if await circuit.is_open(resolved.provider.slug):
            raise AIServiceError(
                f"Provider '{resolved.provider.slug}' temporariamente indisponível.",
                code="circuit_open",
            )

        provider_impl = get_provider(resolved.provider.sdk_kind)
        full_text: list[str] = []
        start = time.monotonic()

        try:
            async for chunk in provider_impl.chat_stream(
                req, model=resolved.model.slug, creds=creds,
            ):
                full_text.append(chunk)
                yield chunk
        except ProviderError as e:
            await circuit.record_error(resolved.provider.slug)
            raise AIServiceError(str(e), code=e.code) from e

        latency = int((time.monotonic() - start) * 1000)
        await circuit.record_success(resolved.provider.slug)

        # Estimativa de tokens (sem usage real no stream — OpenAI stream
        # não retorna usage por default). ~4 chars/token é boa estimativa.
        text_len = sum(len(c) for c in full_text)
        est_tokens_out = max(1, text_len // 4)
        est_tokens_in = max(1, sum(
            len(m.content) if isinstance(m.content, str) else
            sum(len(p.text or "") for p in m.content)
            for m in req.messages
        ) // 4)
        cost = compute_cost_cents(
            est_tokens_in, est_tokens_out,
            resolved.model.input_cost_per_mtok,
            resolved.model.output_cost_per_mtok,
        )
        await self._log_usage(
            resolved=resolved,
            module_code=module_code,
            operation_slug=operation_slug,
            capability=capability,
            prompt_template=None,
            idempotency_key=None,
            fingerprint="",
            tokens_in=est_tokens_in,
            tokens_out=est_tokens_out,
            latency_ms=latency,
            success=True,
            error_code="", error_message="",
            cost_cents_override=cost,
        )
        await quota.record_usage(self.municipality_id, est_tokens_in, est_tokens_out, cost)

    # ── Núcleo: resolve rotas, itera, loga ──────────────────────────────

    async def _execute(
        self,
        *,
        capability: str,
        module_code: str,
        operation_slug: str,
        prompt_template: tuple[str, int] | None,
        idempotency_key: str | None,
        fingerprint: str,
        exec_fn,
    ):
        routes = await self._resolve_routes(capability, module_code)
        if not routes:
            raise NoRouteError(capability)

        # Gate de quota ANTES de chamar qualquer provider.
        try:
            await quota.check_quota(self.db, self.municipality_id)
        except quota.QuotaExceededError as e:
            raise AIServiceError(str(e), code="quota_exceeded") from e

        last_error: ProviderError | None = None
        for resolved in routes:
            prov_slug = resolved.provider.slug
            if await circuit.is_open(prov_slug):
                log.info(
                    "ai_circuit_open_skip",
                    extra={"provider": prov_slug, "capability": capability},
                )
                last_error = ProviderError(
                    f"Circuit aberto em '{prov_slug}'.", code="circuit_open", retriable=True,
                )
                continue

            creds = await self._resolve_credentials(resolved)
            if creds is None:
                last_error = ProviderError(
                    f"Sem credencial pra '{prov_slug}'.", code="no_key", retriable=False,
                )
                continue

            start = time.monotonic()
            try:
                result = await exec_fn(resolved, creds)
            except ProviderError as e:
                latency = int((time.monotonic() - start) * 1000)
                await self._log_usage(
                    resolved=resolved,
                    module_code=module_code,
                    operation_slug=operation_slug,
                    capability=capability,
                    prompt_template=prompt_template,
                    idempotency_key=idempotency_key,
                    fingerprint=fingerprint,
                    tokens_in=0, tokens_out=0,
                    latency_ms=latency,
                    success=False,
                    error_code=e.code,
                    error_message=str(e)[:500],
                )
                if e.retriable:
                    await circuit.record_error(prov_slug)
                last_error = e
                if e.retriable:
                    continue  # tenta próxima rota
                raise AIServiceError(str(e), code=e.code) from e

            # sucesso
            latency = int((time.monotonic() - start) * 1000)
            await circuit.record_success(prov_slug)

            tokens_in = int(getattr(result, "tokens_in", 0) or 0)
            tokens_out = int(getattr(result, "tokens_out", 0) or 0)
            cost_cents = compute_cost_cents(
                tokens_in, tokens_out,
                resolved.model.input_cost_per_mtok,
                resolved.model.output_cost_per_mtok,
            )

            await self._log_usage(
                resolved=resolved,
                module_code=module_code,
                operation_slug=operation_slug,
                capability=capability,
                prompt_template=prompt_template,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency,
                success=True,
                error_code="", error_message="",
                cost_cents_override=cost_cents,
            )

            # Incrementa contadores de quota + verifica alertas 80%/100%.
            await quota.record_usage(
                self.municipality_id, tokens_in, tokens_out, cost_cents,
            )
            await quota.check_and_log_alerts(self.db, self.municipality_id)

            return result

        # Se caiu fora do loop, todas as rotas retriáveis falharam.
        raise AIServiceError(
            f"Todas as rotas falharam para '{capability}'. "
            f"Último erro: {last_error}" if last_error else
            f"Todas as rotas falharam para '{capability}'.",
            code=last_error.code if last_error else "all_routes_failed",
        )

    # ── Resolução de rotas ──────────────────────────────────────────────

    async def _resolve_routes(
        self, capability: str, module_code: str
    ) -> list[_ResolvedRoute]:
        """Busca rotas aplicáveis, ordenadas por (escopo_especificidade, priority).

        Ordem: module (se mun+module) < municipality (se mun) < global.
        Dentro de cada escopo, ``priority`` ASC define ordem de tentativa.
        """
        mun_id = self.municipality_id

        conds = [
            and_(
                AICapabilityRoute.scope == AIRouteScope.global_,
                AICapabilityRoute.municipality_id.is_(None),
            ),
        ]
        if mun_id is not None:
            conds.append(
                and_(
                    AICapabilityRoute.scope == AIRouteScope.municipality,
                    AICapabilityRoute.municipality_id == mun_id,
                )
            )
            conds.append(
                and_(
                    AICapabilityRoute.scope == AIRouteScope.module,
                    AICapabilityRoute.municipality_id == mun_id,
                    AICapabilityRoute.module_code == module_code,
                )
            )

        stmt = (
            select(AICapabilityRoute, AIModel, AIProvider)
            .join(AIModel, AIModel.id == AICapabilityRoute.model_id)
            .join(AIProvider, AIProvider.id == AIModel.provider_id)
            .where(
                AICapabilityRoute.active.is_(True),
                AICapabilityRoute.capability == capability,
                AIModel.active.is_(True),
                AIProvider.active.is_(True),
                or_(*conds),
            )
        )
        rows = (await self.db.execute(stmt)).all()

        # Ordena: module < municipality < global, depois priority ASC.
        def _scope_rank(s: AIRouteScope) -> int:
            return {
                AIRouteScope.module: 0,
                AIRouteScope.municipality: 1,
                AIRouteScope.global_: 2,
            }[s]

        rows.sort(key=lambda r: (_scope_rank(r[0].scope), r[0].priority))

        return [
            _ResolvedRoute(route=r, model=m, provider=p, scope_label=r.scope.value)
            for r, m, p in rows
        ]

    # ── Credenciais ─────────────────────────────────────────────────────

    async def _resolve_credentials(
        self, resolved: _ResolvedRoute
    ) -> ProviderCredentials | None:
        """Busca a chave do provider. Ordem:
        1. Chave do município ativo (personalização), se configurada
        2. Chave global (``municipality_id IS NULL``) como fallback padrão
        3. Sem chave → Ollama aceita vazio; outros retornam None (falha)
        """
        mun_id = self.municipality_id
        row = None

        if mun_id is not None:
            row = await self.db.scalar(
                select(AIMunicipalityKey).where(
                    AIMunicipalityKey.municipality_id == mun_id,
                    AIMunicipalityKey.provider_id == resolved.provider.id,
                    AIMunicipalityKey.active.is_(True),
                )
            )

        if row is None:
            # Fallback: chave global gerenciada pelo SYS.
            row = await self.db.scalar(
                select(AIMunicipalityKey).where(
                    AIMunicipalityKey.municipality_id.is_(None),
                    AIMunicipalityKey.provider_id == resolved.provider.id,
                    AIMunicipalityKey.active.is_(True),
                )
            )

        api_key = ""
        base_url_override = ""
        if row is not None:
            try:
                api_key = decrypt_secret(row.encrypted_api_key)
            except CryptoError:
                log.warning(
                    "ai_key_decrypt_failed",
                    extra={
                        "municipality_id": str(row.municipality_id) if row.municipality_id else "global",
                        "provider": resolved.provider.slug,
                    },
                )
                return None
            base_url_override = row.base_url_override or ""

        base_url = base_url_override or resolved.provider.base_url_default or ""

        # Provider Ollama aceita chave vazia. Outros precisam.
        if not api_key and resolved.provider.sdk_kind.value != "ollama":
            return None

        return ProviderCredentials(api_key=api_key, base_url=base_url)

    # ── Log persistente ─────────────────────────────────────────────────

    async def _log_usage(
        self,
        *,
        resolved: _ResolvedRoute,
        module_code: str,
        operation_slug: str,
        capability: str,
        prompt_template: tuple[str, int] | None,
        idempotency_key: str | None,
        fingerprint: str,
        tokens_in: int,
        tokens_out: int,
        latency_ms: int,
        success: bool,
        error_code: str,
        error_message: str,
        cost_cents_override: int | None = None,
    ) -> None:
        cost = (
            cost_cents_override
            if cost_cents_override is not None
            else compute_cost_cents(
                tokens_in, tokens_out,
                resolved.model.input_cost_per_mtok,
                resolved.model.output_cost_per_mtok,
            )
        )
        prompt_slug, prompt_version = prompt_template or ("", None)

        entry = AIUsageLog(
            municipality_id=self.municipality_id,
            user_id=self.user_id,
            module_code=module_code or "",
            operation_slug=operation_slug,
            capability=capability,
            provider_id=resolved.provider.id,
            provider_slug=resolved.provider.slug,
            model_id=resolved.model.id,
            model_slug=resolved.model.slug,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            unit_cost_in_cents_snapshot=resolved.model.input_cost_per_mtok,
            unit_cost_out_cents_snapshot=resolved.model.output_cost_per_mtok,
            total_cost_cents=cost,
            latency_ms=latency_ms,
            success=success,
            error_code=error_code[:40],
            error_message=error_message[:500],
            prompt_template_slug=prompt_slug,
            prompt_template_version=prompt_version,
            client_idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        self.db.add(entry)
        # flush imediato pra falhas de constraint (ex: idempotency duplicada)
        # virem agora e não no commit do request.
        await self.db.flush()
