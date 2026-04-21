# Gateway de IA

Camada provider-agnostic que centraliza todo consumo de IA do sistema.
Módulos consomem **operações de negócio** (`improve_text`, `extract_patient_document`)
sem saber qual provedor ou modelo está atrás. Trocar OpenAI por Claude por
Llama local não exige mudar código nenhum do consumidor — só muda uma linha
em `ai_capability_routes`.

## Por que existe

Antes disso, cada módulo que precisasse de IA escolheria um SDK, colaria
uma API key em algum lugar, montaria seu próprio prompt, sem registro de
consumo nem controle de custo por município. O gateway resolve:

- **Abstração "MCP-like":** módulos falam com operações tipadas (input/output
  Pydantic), não com providers.
- **Multi-provider:** OpenAI, OpenRouter, Ollama na F1. Adicionar novo = 1
  classe nova implementando `AIProvider`.
- **Gestão centralizada (SYS):** MASTER configura chave global e rotas padrão
  que **todos os municípios usam**. Personalização por município só quando
  necessário.
- **Observabilidade:** cada chamada vira linha em `ai_usage_logs` (tokens,
  custo, latência, sucesso/erro) — **sem persistir payload** (decisão LGPD).
- **Segurança:** API keys cifradas em repouso com Fernet.

## Camadas

```
módulo (ex: HspPatientSearchPage)
  ↓ aiApi.extractPatientDocument(...)
  
/api/v1/ai/operations/{slug}       ← endpoint de consumo
  ↓
operations/extract_patient_document.py
  - valida input (Pydantic)
  - monta prompt + schema de resposta
  - chama service.call_chat(...)
  ↓
app/modules/ai/service.py (AIService)
  - resolve rota (município → módulo → global, por priority)
  - decrypt API key (Fernet)
  - checa circuit breaker (Valkey)
  - itera fallback se provider falhar
  - mede latência, calcula custo (snapshot do preço)
  - persiste ai_usage_logs (sem payload)
  ↓
providers/openai.py | openrouter.py | ollama.py
  - adapter fino: traduz DTO interno → SDK/HTTP do provider
  - não tem lógica de negócio
```

## Modelo de dados (schema `app`)

Todas as tabelas ficam em `app` (não tenant) porque o SYS precisa visão
cross-município.

| Tabela | Função |
|---|---|
| `ai_providers` | Catálogo: slug, sdk_kind, base_url_default, capabilities[], active |
| `ai_models` | Modelos por provider + preço em centavos/Mtok + max_context |
| `ai_municipality_keys` | Chaves Fernet-cifradas. `municipality_id IS NULL` = chave global |
| `ai_capability_routes` | capability → model. `scope` ∈ `global`/`municipality`/`module`, com `priority` pra failover |
| `ai_quotas` | Limites mensais. `municipality_id IS NULL` = quota global |
| `ai_quota_alerts` | Estado "já avisei em 80%/100%" pra não re-disparar (F2) |
| `ai_prompt_templates` | Templates versionados por `(slug, version)` — auditável |
| `ai_usage_logs` | **Particionada RANGE (at) mensal**. Log por chamada, só metadata |

### Unicidade parcial em chaves e quotas

Como `municipality_id` é nullable (NULL = global), os UNIQUE constraints
tradicionais não funcionam. Usamos índices parciais (migration 0021):

```sql
-- Chaves
CREATE UNIQUE INDEX uq_ai_keys_global
  ON app.ai_municipality_keys (provider_id)
  WHERE municipality_id IS NULL;

CREATE UNIQUE INDEX uq_ai_keys_municipal
  ON app.ai_municipality_keys (municipality_id, provider_id)
  WHERE municipality_id IS NOT NULL;

-- Quotas: idem pra (period)
```

### Particionamento do log

`ai_usage_logs` é particionada por `RANGE (at)` mensal. Quando a migration
0019 roda, cria 9 partições (2 meses atrás + atual + 6 à frente). Purge LGPD
vira `DROP PARTITION` em vez de `DELETE + VACUUM`. Índice composto
`(municipality_id, at DESC)` atende o dashboard.

**Cuidado:** a PK inclui `(id, at)` — Postgres exige que a coluna de partição
esteja na PK. Toda query que filtre só por `id` faz sequential scan em todas
as partições. Use `WHERE id = ? AND at BETWEEN ...` sempre que possível.

Criar novas partições mensais é trabalho pra F2 (cron job ou script).

## Escopo global vs por município

A regra de ouro: **config global é o padrão**. Personalização municipal é
exceção.

### Resolução no runtime

Quando uma operação é chamada num contexto municipal:

1. **Rota** — `AIService._resolve_routes` busca rotas ativas pra aquela
   capability, ordenadas por:
   - Escopo (mais específico primeiro): `module` > `municipality` > `global`
   - `priority` ASC (dentro do mesmo escopo)

2. **Credencial** — `AIService._resolve_credentials`:
   1. Busca chave do município ativo pro provider da rota
   2. Se não achou, cai pra chave global (`municipality_id IS NULL`)
   3. Se também não achou → Ollama aceita vazio; outros retornam None (falha)

3. **Chamada** — `ai_service.call_chat(...)` / `call_embed(...)`:
   - Itera as rotas por ordem, tenta cada provider
   - Se um falhar com `retriable=True`, tenta a próxima (failover)
   - Erro não-retriável (auth, param inválido) → propaga imediato
   - Circuit breaker por provider evita cascata: após 5 erros, bloqueia por
     60s (configurável via `AI_CIRCUIT_*`)

## API

### Consumo (qualquer módulo autenticado com `ai.operations.use`)

```
POST /api/v1/ai/operations/{slug}
Headers: Authorization + X-Work-Context
Body: { "inputs": {...}, "moduleCode": "hsp", "idempotencyKey": "..." }
```

Operations disponíveis na F1:

| Slug | Capability | Input | Output |
|---|---|---|---|
| `improve_text` | chat | `{text, style, language}` | `{improvedText, changed}` |
| `summarize` | chat | `{text, maxWords, context}` | `{summary}` |
| `classify` | chat | `{text, labels[], allowOther}` | `{label, confidence}` |
| `extract_patient_document` | chat_vision | `{imageUrl, hintDocumentType}` | `{name, cpf, rg, cns, birthDate, motherName, ...}` |
| `embed_text` | embed_text | `{inputs[], dimensions}` | `{vectors[], dim}` |

Listar descoberta:

```
GET /api/v1/ai/operations/        # retorna slugs + schemas JSON
```

### Admin (MASTER — `/sys/ai/*`)

Todos os endpoints aceitam `?municipality_id=<uuid>` opcional:
- omitido → **escopo global** (padrão que todos usam)
- preenchido → personalização pra aquele município

| Método | Path | Função |
|---|---|---|
| `GET`/`POST`/`PUT`/`DELETE` | `/sys/ai/providers[/{id}]` | Catálogo de providers |
| `GET`/`POST`/`PUT`/`DELETE` | `/sys/ai/models[/{id}]` | Catálogo de modelos |
| `GET` | `/sys/ai/routes[?municipality_id]` | Lista rotas (global OU do município) |
| `PUT` | `/sys/ai/routes` | Upsert rota (scope no payload decide) |
| `DELETE` | `/sys/ai/routes/{id}` | Remove rota |
| `GET`/`PUT`/`DELETE` | `/sys/ai/keys[?municipality_id]` | Chaves global/municipais |
| `POST` | `/sys/ai/keys/test[?municipality_id]` | Dispara ping no provider |
| `GET`/`PUT`/`DELETE` | `/sys/ai/quotas[?municipality_id]` | Quotas global/municipais |
| `GET`/`POST`/`PUT`/`DELETE` | `/sys/ai/prompts[/{id}]` | Templates versionados |
| `GET` | `/sys/ai/usage[?municipality_id&...]` | Log paginado |
| `GET` | `/sys/ai/usage/summary` | Agregações |

> OPS **não** tem endpoints de config. A gestão é centralizada no SYS por
> decisão arquitetural — módulos OPS só consomem operations via
> `ai.operations.use`.

## Consumir IA num módulo (front e back)

### Frontend

```typescript
import { aiApi } from '../../api/ai'

const { output, usage } = await aiApi.improveText(
  { text: 'meu texto', style: 'formal' },
  { moduleCode: 'hsp', idempotencyKey: 'opt-key' }
)
// output.improvedText, output.changed
// usage.tokensIn, usage.totalCostCents, usage.latencyMs
```

Para UI com loading/error/toast automáticos:

```typescript
import { useAIOperation } from '../../hooks/useAIOperation'

const { run, loading, error, lastUsage } = useAIOperation(aiApi.improveText)

<button onClick={async () => {
  const r = await run({ text: 'oi', style: 'formal' }, 'hsp')
  if (r) console.log(r.output.improvedText)
}} disabled={loading}>
  Polir texto
</button>
```

### Backend (quando o módulo precisa chamar IA server-side)

```python
from app.modules.ai.service import AIService
from app.modules.ai.operations import ImproveText

async def handler(db, ctx):
    service = AIService(db, ctx)
    output, usage_hint = await ImproveText.run(
        service,
        {"text": "meu texto", "style": "formal"},
        module_code="hsp",
    )
    return output.improved_text
```

## Adicionar uma nova operation

1. Criar arquivo `app/modules/ai/operations/<slug>.py`:

```python
from pydantic import BaseModel, Field
from app.modules.ai.operations.base import AIOperation
from app.modules.ai.providers.base import ChatMessage, ChatRequest
from app.modules.ai.service import AIService


class MinhaInput(BaseModel):
    texto: str = Field(min_length=1)


class MinhaOutput(BaseModel):
    resultado: str


class MinhaOp(AIOperation[MinhaInput, MinhaOutput]):
    slug = "minha_op"
    capability = "chat"           # ou "chat_vision", "embed_text"
    prompt_slug = "minha_op"
    prompt_version = 1
    input_model = MinhaInput
    output_model = MinhaOutput

    @classmethod
    async def _run(cls, service: AIService, inp: MinhaInput, *,
                   module_code: str, idempotency_key: str | None):
        req = ChatRequest(
            messages=[
                ChatMessage(role="system", content="..."),
                ChatMessage(role="user", content=inp.texto),
            ],
            response_schema={"type": "object", "required": ["resultado"],
                             "properties": {"resultado": {"type": "string"}}},
        )
        resp = await service.call_chat(
            req, capability=cls.capability, module_code=module_code,
            operation_slug=cls.slug,
            prompt_template=(cls.prompt_slug, cls.prompt_version),
            idempotency_key=idempotency_key,
        )
        # parse resp.text como JSON
        return MinhaOutput(resultado=...), {"tokens_in": resp.tokens_in, ...}
```

2. Registrar em `app/modules/ai/operations/__init__.py`:

```python
from app.modules.ai.operations.minha_op import MinhaOp

_OPERATIONS = {
    ...,
    MinhaOp.slug: MinhaOp,
}
```

3. (Opcional) Adicionar row no seed `ai_prompt_templates` pra auditoria.

4. Adicionar wrapper no `frontend/src/api/ai.ts`:

```typescript
export const aiApi = {
  ...,
  minhaOp: (input: MinhaInput, args: OpArgs) =>
    runOp<MinhaOutput>('minha_op', input, args),
}
```

Não precisa mexer no router nem em UI admin — a nova operation fica
imediatamente disponível em `POST /ai/operations/minha_op`.

## Adicionar um novo provider

1. Criar `app/modules/ai/providers/<nome>.py` herdando `AIProvider`:

```python
from app.modules.ai.providers.base import (
    AIProvider, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse,
    ProviderCredentials,
)

class MeuProvider(AIProvider):
    slug = "meu_provider"

    async def chat(self, req: ChatRequest, *, model: str, creds: ProviderCredentials) -> ChatResponse:
        # ... traduzir DTO interno, chamar HTTP/SDK, mapear erros pra ProviderError
        return ChatResponse(text=..., tokens_in=..., tokens_out=...)

    async def embed(self, req, *, model, creds): ...
```

2. Adicionar enum value em `models.py`:

```python
class AISdkKind(str, enum.Enum):
    ...
    meu_provider = "meu_provider"
```

3. Registrar em `providers/__init__.py`:

```python
_REGISTRY = {
    ...,
    AISdkKind.meu_provider: MeuProvider(),
}
```

4. MASTER cadastra em `/sys/ia` → tab **Provedores** → Novo provedor
   (slug, sdk_kind, capabilities suportadas).

## Segurança

### Criptografia de chaves (`app/core/crypto.py`)

- Tokens Fernet com prefixo `fernet:v1:<base64>`
- Chave mestre em env `SECRETS_ENCRYPTION_KEY` (32 bytes base64-url)
- `encrypt_secret(plain)` / `decrypt_secret(token)` — helpers genéricos
- `is_encrypted()` permite rollout gradual (texto sem prefixo passa direto)
- **Retrofit aplicado ao CadSUS** na mesma leva (migration 0018)

Gerar chave nova pra um ambiente:

```bash
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

### LGPD: zero payload nos logs

`ai_usage_logs` **não** guarda texto/imagem enviado nem resposta. Só metadata:

- tokens in/out + custo congelado no momento da chamada
- latência, provider, modelo, operation
- `request_fingerprint` = sha256 do input canônico (permite dedupe sem vazar)
- idempotency_key opcional do cliente

Pra debugar caso específico, reproduz a operação manualmente via `/sys/ia`.

### O que MASTER vê vs o que o banco guarda

- Chave `encrypted_api_key`: apenas token cifrado no banco
- API retorna: `configured`, `keyFingerprint` (sha256[:16]), `keyLast4`
- A chave original **nunca** volta pro frontend. Pra rotacionar, cola a nova.

## Permissões

Só 2 códigos de permissão, declarados em `core/permissions/catalog.py`:

- `ai.operations.use` — qualquer consumidor (incluir em perfis de usuário clínico)
- `ai.platform.admin` — config no SYS (usuários MASTER já passam pelo
  `require_master` guard, o código fica pra futura delegação se o negócio
  exigir)

## Observabilidade

- **Logs estruturados** (`structlog`): `ai_circuit_open_skip`, `ai_key_decrypt_failed` etc
- **Usage log**: fonte de verdade pra relatório de consumo. Dashboard lê daqui.
- **Prometheus metrics**: planejado pra F2 (`ai_requests_total`, `ai_latency_seconds`, `ai_tokens_total`, `ai_cost_cents_total`)
- **Audit log** (`app.audit_logs`, já existente): mudanças em chaves/rotas/quotas entram aqui automaticamente via `@audited`

## Testes

Escritos mas executados manualmente via Python (container de prod não tem
pytest — rodar via `uv run pytest` no host ou num dev container):

- `tests/test_crypto.py` — roundtrip Fernet, idempotência, fingerprint
- `tests/test_ai_costs.py` — `compute_cost_cents` em 4 cenários
- Smoke inline no container: registry de operations/providers, decrypt com chave do `.env`

## Configuração (env vars)

```
# Obrigatórias
SECRETS_ENCRYPTION_KEY=<base64 32 bytes>

# Opcionais (com defaults)
AI_DEFAULT_TIMEOUT_SECONDS=30
AI_MAX_RETRIES=2
AI_CIRCUIT_OPEN_AFTER_ERRORS=5
AI_CIRCUIT_COOLDOWN_SECONDS=60
AI_USAGE_LOG_RETENTION_MONTHS=24
```

## Setup inicial (primeiro uso)

1. Garantir `SECRETS_ENCRYPTION_KEY` no `.env`
2. Rodar migrations: `alembic upgrade head` (aplica 0018 + 0019 + 0020 + 0021)
3. Seed já cria: 3 providers (openai, openrouter, ollama), 10 modelos com preços, 4 prompts
4. No frontend: MASTER abre `/sys/ia`
5. Tab **Chaves** (escopo Global) → configurar API key do OpenAI (ou outro)
6. Tab **Rotas** (escopo Global) → criar rota `chat → gpt-4o-mini`, priority=0
7. Testar consumo: HSP → Buscar paciente → "Ler documento" → scanner captura →
   `aiApi.extractPatientDocument` → form de novo paciente pré-preenchido

Para personalizar um município: no seletor de escopo, escolher o município →
configurar chave e/ou rotas próprias → sistema usa as do município quando
disponíveis, caindo em global automaticamente quando não.

## Reconhecimento facial (F2a) — fora do gateway

O reconhecimento facial **não passa pelo gateway de IA** porque roda
100% local com [InsightFace](https://github.com/deepinsight/insightface)
(ArcFace `buffalo_l`, 512-dim). Zero custo de API, foto nunca sai do
backend auto-hospedado. Documentação completa no próprio módulo; aqui só
o essencial:

### Pipeline
1. **Upload de foto** em `PatientService.set_photo` (`hsp/service.py`)
   dispara `face_service.enroll_from_photo` após o flush. Embedding é
   gerado pelo InsightFace e salvo em `patient_face_embeddings` (tenant)
   via UPSERT (1 embedding ativo por paciente).
2. **Match**: `POST /hsp/patients/match-face` recebe JPEG multipart,
   gera embedding da imagem recebida, faz `ORDER BY embedding <=> :q` em
   pgvector e retorna top-5 candidatos com score de similaridade.

### Componentes
- `app/services/face/engine.py` — singleton `FaceAnalysis` com
  ThreadPoolExecutor (2 workers) + `warm()` em background no lifespan.
  Modelos cacheados em volume `/home/app/.insightface` (~320 MB).
- `app/modules/hsp/face_service.py` — enroll, match, reindex_all,
  delete_embedding.
- `app/modules/hsp/face_router.py` — `POST /hsp/patients/match-face`,
  `DELETE /hsp/patients/{id}/face-embedding`, `POST /hsp/admin/face/reindex`.
- `app/tenant_models/face.py` — `PatientFaceEmbedding` com
  `pgvector.sqlalchemy.Vector(512)` + UNIQUE patient_id + índice HNSW.
- `scripts/face_reindex.py` — backfill CLI
  (`python -m scripts.face_reindex --ibge 5208707 [--force]`).

### Infra
- Imagem Postgres: `pgvector/pgvector:pg17`
- Dockerfile adiciona `libgl1 libglib2.0-0` e build tools pra onnx.
- Extensão `vector` criada via migration `0023_pgvector_extension` no
  schema `public` (disponível via search_path dos tenants).
- Tabela tenant criada via `t0007_face_embeddings`.

### Config (system_settings)
- `hsp.face.match_threshold` — default `0.40` (cosine similarity mínima
  para retornar candidato).
- `hsp.face.min_detection_score` — default `0.50` (score mínimo do
  detector para aceitar enroll/match).

### Modo stub (testes)
`ZSAUDE_FACE_STUB=1` gera embeddings determinísticos a partir do hash da
imagem — mesma imagem → mesmo vetor. Sem download de modelo; útil em CI.

### Permissões
- `hsp.patient.face_match` — chamar `/match-face`.
- `hsp.face.reindex` — endpoint admin (requer MASTER).

### LGPD
- Opt-out via `DELETE /hsp/patients/{id}/face-embedding`.
- Foto trafega cifrada (HTTPS) entre o browser autenticado e o backend;
  o embedding é um vetor irreversível (não reconstrói a foto).
- Todo match entra no audit log (`HSP` / `face_match`) com quem fez,
  quantos candidatos e melhor score — sem gravar o embedding em si.

## Fases futuras

- **F2b:** quotas reais com Valkey sliding counter, dashboards com
  gráficos, provider Anthropic nativo, partições automáticas de
  `ai_usage_logs`.
- **F3:** streaming SSE pra operações longas, prompt A/B via versioning,
  PII redaction opcional em prompts, export CSV do consumo.

## Referências

- Migrations: `backend/migrations/versions/20260416_00{18,19,20,21}_*.py`
- Models: `backend/app/modules/ai/models.py`
- Service: `backend/app/modules/ai/service.py`
- Router: `backend/app/modules/ai/router.py`
- Operations: `backend/app/modules/ai/operations/`
- Providers: `backend/app/modules/ai/providers/`
- Crypto: `backend/app/core/crypto.py`
- Frontend API: `frontend/src/api/ai.ts`
- Hook: `frontend/src/hooks/useAIOperation.ts`
- UI admin: `frontend/src/pages/sys/SysAiPage.tsx`
- Integração OCR: `frontend/src/pages/hsp/HspPatientSearchPage.tsx` (callback do `DocumentScannerModal`)
