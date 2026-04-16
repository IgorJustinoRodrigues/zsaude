# Gateway de IA — receitas

Guias passo-a-passo pra criar recursos novos em cima do gateway. Leia
primeiro [ai-gateway.md](./ai-gateway.md) pra entender a arquitetura.

Todas as receitas seguem o mesmo padrão: **operation** (prompt + schema de
saída) no backend, **endpoint automático** `/ai/operations/<slug>`, **client
tipado** no front, consumo no módulo. Você nunca mexe no service, router ou
providers — só adiciona arquivos.

## Índice

1. [Nova operation com saída estruturada (JSON)](#1-nova-operation-com-saída-estruturada-json)
2. [Operation de visão (imagem → dados)](#2-operation-de-visão-imagem--dados)
3. [Operation de embeddings + busca semântica](#3-operation-de-embeddings--busca-semântica)
4. [Nova capability (speech-to-text etc)](#4-nova-capability)
5. [Adicionar modelo novo ao catálogo](#5-adicionar-modelo-novo-ao-catálogo)
6. [Bumpar versão de prompt](#6-bumpar-versão-de-prompt)
7. [Integrar IA num módulo existente](#7-integrar-ia-num-módulo-existente)
8. [Receita: triagem automática](#8-receita-triagem-automática)
9. [Receita: busca semântica no histórico do paciente](#9-receita-busca-semântica-no-histórico-do-paciente)
10. [Receita: assistente com contexto do paciente](#10-receita-assistente-com-contexto-do-paciente)

---

## 1. Nova operation com saída estruturada (JSON)

Caso mais comum. Use quando quer que o modelo devolva campos tipados (não
texto livre).

**Exemplo:** extrair intenção + urgência de uma queixa do paciente.

### Backend

`backend/app/modules/ai/operations/classify_complaint.py`:

```python
from __future__ import annotations

import json
import time
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.modules.ai.operations.base import AIOperation
from app.modules.ai.providers.base import ChatMessage, ChatRequest
from app.modules.ai.service import AIService


class ClassifyComplaintInput(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class ClassifyComplaintOutput(BaseModel):
    category: Literal["dor", "febre", "trauma", "respiratório", "psicológico", "outro"]
    urgency: Literal["baixa", "média", "alta", "emergência"]
    suggested_specialty: str
    reasoning: str


_SYSTEM = """\
Você é um triador de queixas de saúde. Dada a queixa livre do paciente,
classifique categoria e urgência. Responda APENAS JSON no schema definido.
Urgência 'emergência' só pra risco imediato de vida (ex: dor no peito com
sudorese, sangramento intenso, desmaio). 'alta' = atendimento hoje.
"""

_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["category", "urgency", "suggested_specialty", "reasoning"],
    "properties": {
        "category": {"enum": ["dor", "febre", "trauma", "respiratório", "psicológico", "outro"]},
        "urgency": {"enum": ["baixa", "média", "alta", "emergência"]},
        "suggested_specialty": {"type": "string"},
        "reasoning": {"type": "string", "maxLength": 300},
    },
}


class ClassifyComplaint(AIOperation[ClassifyComplaintInput, ClassifyComplaintOutput]):
    slug = "classify_complaint"
    capability = "chat"
    prompt_slug = "classify_complaint"
    prompt_version = 1
    input_model = ClassifyComplaintInput
    output_model = ClassifyComplaintOutput

    @classmethod
    async def _run(cls, service, inp, *, module_code, idempotency_key):
        req = ChatRequest(
            messages=[
                ChatMessage(role="system", content=_SYSTEM),
                ChatMessage(role="user", content=inp.text),
            ],
            temperature=0.0,
            response_schema=_SCHEMA,
        )
        start = time.monotonic()
        resp = await service.call_chat(
            req, capability=cls.capability, module_code=module_code,
            operation_slug=cls.slug,
            prompt_template=(cls.prompt_slug, cls.prompt_version),
            idempotency_key=idempotency_key,
        )
        latency_ms = int((time.monotonic() - start) * 1000)

        try:
            parsed = json.loads(resp.text or "{}")
        except json.JSONDecodeError:
            parsed = {}

        output = ClassifyComplaintOutput(
            category=parsed.get("category", "outro"),
            urgency=parsed.get("urgency", "baixa"),
            suggested_specialty=parsed.get("suggested_specialty", ""),
            reasoning=parsed.get("reasoning", ""),
        )
        return output, {
            "tokens_in": resp.tokens_in, "tokens_out": resp.tokens_out,
            "latency_ms": latency_ms,
        }
```

Registrar em `operations/__init__.py`:

```python
from app.modules.ai.operations.classify_complaint import ClassifyComplaint

_OPERATIONS = {
    ...,
    ClassifyComplaint.slug: ClassifyComplaint,
}
```

### Frontend

`frontend/src/api/ai.ts`:

```typescript
export interface ClassifyComplaintInput { text: string }
export interface ClassifyComplaintOutput {
  category: 'dor' | 'febre' | 'trauma' | 'respiratório' | 'psicológico' | 'outro'
  urgency: 'baixa' | 'média' | 'alta' | 'emergência'
  suggestedSpecialty: string
  reasoning: string
}

export const aiApi = {
  ...,
  classifyComplaint: (input: ClassifyComplaintInput, args: OpArgs) =>
    runOp<ClassifyComplaintOutput>('classify_complaint', input, args),
}
```

### Consumo na UI

```tsx
const { run, loading } = useAIOperation(aiApi.classifyComplaint)

const onSubmit = async (queixa: string) => {
  const r = await run({ text: queixa }, 'cln')
  if (r) {
    console.log(r.output.category, r.output.urgency)
    if (r.output.urgency === 'emergência') {
      toast.error('ATENÇÃO', r.output.reasoning)
    }
  }
}
```

**Pronto.** Endpoint `POST /ai/operations/classify_complaint` aparece
automaticamente no OpenAPI.

---

## 2. Operation de visão (imagem → dados)

Para extração por OCR, análise de exame, leitura de ECG, etc. Mesma
estrutura, mas usa `capability = "chat_vision"` e mensagens com `ContentPart`
do tipo `image`.

Exemplo: detectar legibilidade de receita médica.

```python
from app.modules.ai.providers.base import ChatMessage, ChatRequest, ContentPart


class ReceitaLegivelInput(BaseModel):
    image_url: str  # data URL ou https

class ReceitaLegivelOutput(BaseModel):
    legivel: bool
    confianca: float
    observacoes: str


class ReceitaLegivel(AIOperation[ReceitaLegivelInput, ReceitaLegivelOutput]):
    slug = "receita_legivel"
    capability = "chat_vision"  # ← vision
    prompt_slug = "receita_legivel"
    prompt_version = 1
    input_model = ReceitaLegivelInput
    output_model = ReceitaLegivelOutput

    @classmethod
    async def _run(cls, service, inp, *, module_code, idempotency_key):
        req = ChatRequest(
            messages=[
                ChatMessage(role="system", content="Analise a legibilidade da receita..."),
                ChatMessage(
                    role="user",
                    content=[
                        ContentPart(kind="text", text="Esta receita é legível?"),
                        ContentPart(kind="image", image_url=inp.image_url),
                    ],
                ),
            ],
            response_schema={...},
        )
        resp = await service.call_chat(req, capability=cls.capability, ...)
        # parse...
```

**Importante:** rota `chat_vision` precisa apontar pra modelo com suporte
(gpt-4o, gpt-4o-mini, llava:7b, claude-3.5-sonnet). Se a rota padrão `chat`
estiver configurada pro `gpt-4o-mini` (que suporta vision), funciona sem
mexer em nada — mas o jeito correto é ter rota separada pra `chat_vision`
apontando pro modelo certo.

Veja o `extract_patient_document.py` como referência completa.

---

## 3. Operation de embeddings + busca semântica

Embeddings transformam texto em vetor de floats. Útil pra busca por
significado (não só palavras exatas).

### Passo 1: operation pra gerar embeddings

Já existe `embed_text` — use diretamente:

```python
from app.modules.ai.operations import EmbedText

output, _ = await EmbedText.run(
    service,
    {"inputs": ["consulta cardiológica do paciente X"]},
    module_code="hsp",
)
vector = output.vectors[0]  # list[float], dim=1536 (OpenAI) ou outro
```

### Passo 2: guardar vetores em coluna pgvector (no schema do município)

Exemplo: indexar anotações clínicas.

`migrations_tenant/versions/XXX_anotacoes_embeddings.py`:

```python
def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    op.execute("""
        CREATE TABLE anotacao_embeddings (
            id UUID PRIMARY KEY,
            anotacao_id UUID NOT NULL REFERENCES anotacoes(id) ON DELETE CASCADE,
            patient_id UUID NOT NULL,
            content_hash CHAR(64) NOT NULL,
            embedding vector(1536),  -- OpenAI text-embedding-3-small
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(anotacao_id)
        );
        CREATE INDEX ix_anot_emb_patient ON anotacao_embeddings (patient_id);
        CREATE INDEX ix_anot_emb_cos ON anotacao_embeddings
            USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
    """)
```

### Passo 3: gerar ao salvar anotação (writer path)

```python
# no PatientService.add_nota
nota = Anotacao(...)
self.session.add(nota)
await self.session.flush()

# embedding
from app.modules.ai.operations import EmbedText
svc = AIService(self.session, self.ctx)
emb_out, _ = await EmbedText.run(
    svc, {"inputs": [nota.texto]}, module_code="hsp",
)
vector = emb_out.vectors[0]

self.session.add(AnotacaoEmbedding(
    anotacao_id=nota.id,
    patient_id=nota.patient_id,
    content_hash=hashlib.sha256(nota.texto.encode()).hexdigest(),
    embedding=vector,
))
```

### Passo 4: busca

```python
# dado uma pergunta em linguagem natural
pergunta = "o paciente teve dor no peito recente?"
emb, _ = await EmbedText.run(
    svc, {"inputs": [pergunta]}, module_code="hsp",
)
query_vec = emb.vectors[0]

# cosine similarity (pgvector)
from sqlalchemy import text
rows = await db.execute(
    text("""
        SELECT anotacao_id, 1 - (embedding <=> :q) AS score
        FROM anotacao_embeddings
        WHERE patient_id = :pid
        ORDER BY embedding <=> :q ASC
        LIMIT 10
    """),
    {"q": str(query_vec), "pid": str(patient_id)},
)
```

**Dimensão do vetor** depende do modelo. Muda? Rebuild completo do índice.

---

## 4. Nova capability

Capabilities são as categorias que os providers declaram suportar: `chat`,
`chat_vision`, `embed_text`, `embed_image`, `transcribe`. O service usa
capability pra rotear pro modelo certo (ex: rota
`capability="chat_vision"` exige modelo multimodal).

Adicionar uma nova (ex: `rerank`):

1. Em `providers/base.py`, adicionar constante e incluir no set:
   ```python
   RERANK = "rerank"
   ALL_CAPABILITIES = {CHAT, CHAT_VISION, EMBED_TEXT, EMBED_IMAGE, TRANSCRIBE, RERANK}
   ```

2. Provider correspondente implementa o método. Se o `AIProvider` ainda só
   tem `chat` e `embed`, adicione um método novo (ex: `async def rerank(req, *, model, creds) -> RerankResponse`). Ajuste a base class e cada provider.

3. Adicione seu handler no `AIService` (ex: `call_rerank`) que delega pro
   método do provider.

4. Operation usa:
   ```python
   class Rerankear(AIOperation[...]):
       capability = "rerank"
       # ...
       async def _run(cls, service, inp, ...):
           await service.call_rerank(...)
   ```

5. Providers que **não** suportam devem levantar `ProviderCapabilityError`
   no método correspondente.

**Evite:** usar capabilities como "qualquer capability customizada que eu
quiser" — elas devem ser uma das 5-6 categorias técnicas do mercado. Pra
casos de negócio específicos (ex: "triagem"), a unidade de composição é a
**operation**, não a capability.

---

## 5. Adicionar modelo novo ao catálogo

### Via UI (SYS MASTER)

1. `/sys/ia` → tab **Modelos** → Novo modelo
2. Escolha provider, cole slug exato (ex: `gpt-4-turbo`), marque
   capabilities suportadas, preencha preços em centavos/Mtok
3. Salvar

O modelo fica disponível imediatamente pra usar em rotas.

### Via seed (pra deploys reprodutíveis)

Edite `migrations/versions/20260416_0020_ai_catalog_seed.py` e adicione à
lista `MODELS`. Migration é idempotente — re-rodar não duplica mas também
**não atualiza** entradas existentes (ON CONFLICT DO NOTHING). Se o preço
mudou, UPDATE manual ou criar migration de ajuste.

---

## 6. Bumpar versão de prompt

Prompts são versionados por `(slug, version)`. Quando você melhora o prompt
de uma operation:

1. Na classe da operation, incrementa `prompt_version`:
   ```python
   class ImproveText(AIOperation[...]):
       prompt_slug = "improve_text"
       prompt_version = 2  # ← era 1
   ```
2. Atualiza o `_SYSTEM` (ou o prompt embutido) com o novo texto
3. (Opcional) Cria migration que `INSERT` a nova `(slug, version=2)` em
   `ai_prompt_templates` pra registro auditável

Logs de consumo gravam `prompt_template_version`, então você consegue fazer
regressão: "A mudança pra v2 aumentou erro?".

> Na F1 o prompt real vive no código Python — o `ai_prompt_templates`
> é só registro. Em F3 o carregamento dinâmico lê `body` do banco, e aí
> bumpar versão sem rebuild passa a funcionar.

---

## 7. Integrar IA num módulo existente

Cenário: você trabalha no módulo CLN (clínica) e quer adicionar "resumir
consulta" na tela de atendimento. Passos:

### 7.1 Garantir a operation

Se já existe (ex: `summarize`), pule. Senão, crie conforme [receita 1](#1-nova-operation-com-saída-estruturada-json).

### 7.2 Garantir rota configurada

Chame a API:
```
GET /api/v1/sys/ai/routes
```

Se não tem rota `chat` ativa, MASTER precisa cadastrar em `/sys/ia` →
Rotas. Sem rota → `AIService` levanta `NoRouteError` → endpoint devolve
`503`.

### 7.3 Consumir no frontend

```tsx
import { aiApi } from '../../api/ai'
import { useAIOperation } from '../../hooks/useAIOperation'

function AtendimentoPage() {
  const { run, loading } = useAIOperation(aiApi.summarize)
  const [resumo, setResumo] = useState<string | null>(null)

  const handleResumir = async (notas: string) => {
    const r = await run({ text: notas, maxWords: 120 }, 'cln')
    if (r) setResumo(r.output.summary)
  }

  return (
    <>
      <button onClick={() => handleResumir(textoDaConsulta)}>
        {loading ? 'Resumindo...' : 'Resumir'}
      </button>
      {resumo && <p>{resumo}</p>}
    </>
  )
}
```

### 7.4 Permissão

Garantir que os perfis do módulo (ex: `cln.medic`) incluem `ai.operations.use`.
Em geral, inclua nos roles base em `core/permissions/seed.py` se for
universal, ou deixe o admin do município habilitar por perfil.

### 7.5 Custo/telemetria

Ao salvar a consulta, você pode persistir `usage.totalCostCents` pra
rastreabilidade. Exemplo: campo `ai_cost_cents INT DEFAULT 0` na tabela de
consulta.

---

## 8. Receita: triagem automática

**Objetivo:** paciente descreve queixa, IA classifica urgência, sistema
coloca na fila certa.

**Componentes:**
- Operation `classify_complaint` (ver [receita 1](#1-nova-operation-com-saída-estruturada-json))
- Campo `urgency` na tabela `queue_entries` (tenant)
- Handler no backend que chama a operation ao criar entrada na fila

```python
# app/modules/cln/service.py
async def enqueue_patient(self, patient_id, complaint_text):
    ai = AIService(self.session, self.ctx)
    classif, _ = await ClassifyComplaint.run(
        ai, {"text": complaint_text}, module_code="cln",
    )

    entry = QueueEntry(
        patient_id=patient_id,
        complaint=complaint_text,
        urgency=classif.urgency,
        ai_category=classif.category,
        ai_suggested_specialty=classif.suggested_specialty,
        ai_reasoning=classif.reasoning,
    )
    self.session.add(entry)

    # Alerta visível pra recepção em caso de emergência
    if classif.urgency == "emergência":
        await self._notify_triage_team(entry, classif.reasoning)

    return entry
```

**Cuidados:**
- **Não substitua julgamento clínico.** A UI deve mostrar o motivo
  (`reasoning`) e permitir override manual do enfermeiro
- Logue **sempre** o `operation_slug` e `prompt_version` junto da decisão
  — auditoria exige saber qual versão do prompt classificou
- Pense em fallback: se IA cair (503), a fila continua funcionando com
  urgência "média" default + flag "triagem pendente"

---

## 9. Receita: busca semântica no histórico do paciente

**Objetivo:** "O paciente teve queixa pulmonar nos últimos 6 meses?" responder
em linguagem natural sem o médico precisar scroll infinito de anotações.

**Componentes:**
- Operation `embed_text` (já existe)
- Tabela tenant `anotacao_embeddings` (ver [receita 3](#3-operation-de-embeddings--busca-semântica))
- Endpoint de busca na tabela
- (Opcional) Operation `answer_question_with_context` que recebe as
  top-N anotações + pergunta e responde em prosa

### Fluxo

```
médico digita pergunta
  ↓
frontend: aiApi.embedText({inputs: [pergunta]})
  ↓
backend: recebe vetor, consulta pgvector pelo patient_id
  ↓
top-10 anotações retornam com score
  ↓
(opcional) aiApi.answerWithContext({question, contexts: [...]}) → resposta
  ↓
UI mostra resposta + lista de anotações citadas (pra médico validar)
```

### Detalhes importantes

- **Dedupe por `content_hash`:** não re-gerar embedding de nota inalterada
- **Backfill:** rodar um job batch pra popular embeddings de anotações
  antigas (em background, respeitando quotas)
- **Limites de contexto:** se top-10 anotações forem gigantes, trunque no
  prompt de `answer_with_context` pra não estourar `max_context` do modelo
- **Citar fontes:** resposta deve referenciar anotações específicas
  ("Em 2025-12-03 o paciente relatou..."). Isso é prompt engineering + ter
  o id/data das anotações no contexto.

---

## 10. Receita: assistente com contexto do paciente

**Objetivo:** médico pergunta em linguagem natural; sistema responde com
base em tudo que sabe do paciente (prontuário, exames, consultas
anteriores).

**Componentes:**
- Operation customizada tipo `ask_about_patient` (chat)
- No `_run`, montar o prompt user com um **bloco de contexto**:
  ```python
  async def _run(cls, service, inp, *, module_code, idempotency_key):
      # Carrega contexto do paciente (fora do LLM, via SQL direto)
      ctx_blocks = await _load_patient_context(service.db, inp.patient_id)

      messages = [
          ChatMessage(role="system", content=_SYSTEM),
          ChatMessage(role="user", content=(
              "CONTEXTO DO PACIENTE:\n"
              + "\n\n".join(ctx_blocks)
              + f"\n\nPERGUNTA: {inp.question}"
          )),
      ]
      ...
  ```
- `_load_patient_context` busca: dados básicos + últimas N consultas +
  alergias + medicações atuais. **Sem PII desnecessária.**

**Cuidados grandes:**

- **LGPD:** antes de enfiar histórico de paciente num LLM externo, confirme
  que o provedor ativo (ver `ai_capability_routes`) tem contrato compatível.
  OpenAI não usa dados em treinamento (via API), mas Ollama local é o ideal.
  Considere criar rota `chat → ollama llama3.2` específica pro módulo CLN
  (scope=module) pra garantir on-premise pra este caso.
- **Tamanho do contexto:** trunque. GPT-4o aguenta 128k tokens, mas custo
  sobe linearmente com tokens de input. Selecione **o mínimo útil**.
- **Alucinação:** LLMs inventam. Instrua explícito no system prompt:
  "responda 'não sei' se não tiver informação suficiente no contexto".
  Valide com `confidence` no schema de saída.
- **Streaming:** resposta longa fica travada na UI. Entra na F3 (SSE).

---

## Pegadinhas de schema (OpenAI `strict` mode)

O `response_schema` que passamos vira `response_format.json_schema` com
`strict: true`. A API do OpenAI tem regras rígidas nesse modo:

1. **Todos os `properties` precisam estar em `required`.** Pra expressar
   campos "opcionais", use `{"type": ["string", "null"]}` e liste no
   required mesmo assim — o modelo devolve `null` quando não detectar.

2. **`additionalProperties: false` é obrigatório.**

3. **Schemas com `minimum`/`maximum` em number podem ser rejeitados.**
   Valide no Python após o parse.

4. **Root precisa ser `object`** (não `array` no topo).

5. **Sem `oneOf`/`anyOf`/`$ref`** no root. Pra variantes, modele como
   um campo discriminante com enum e cubra todas as props.

Exemplo correto de campo opcional:

```python
_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["texto", "confianca", "observacao"],  # todos!
    "properties": {
        "texto": {"type": "string"},
        "confianca": {"type": "number"},
        "observacao": {"type": ["string", "null"]},  # pode vir null
    },
}
```

## Checklist antes de mergear uma feature IA

- [ ] Operation tem `prompt_version` definido
- [ ] Input tem `max_length` nas strings pra evitar abuse
- [ ] Output tem schema estruturado (JSON mode) sempre que possível
- [ ] Fallback defensivo: se IA cair, a feature ainda funciona (mesmo que degradada)
- [ ] UI mostra `reasoning`/confidence pro usuário avaliar
- [ ] Testado com modelo barato (gpt-4o-mini) antes de subir pra gpt-4o
- [ ] Permissão `ai.operations.use` verificada nos perfis afetados
- [ ] Telemetria: logue `totalCostCents` e `tokensIn+Out` pra monitorar custo
- [ ] Considerar rota `scope=module` específica se o caso exigir modelo on-prem (LGPD)
- [ ] Doc do módulo menciona a dependência de IA

## Leitura adicional

- [ai-gateway.md](./ai-gateway.md) — arquitetura, fluxo, referências
- [multi-tenant.md](./multi-tenant.md) — onde guardar tabelas derivadas
  (ex: embeddings) e como o schema por município funciona
- [rbac.md](./rbac.md) — adicionar permissão nova se for preciso gate fino
- [migrations.md](./migrations.md) — criar migration em `migrations/` (app)
  vs `migrations_tenant/` (por município)
