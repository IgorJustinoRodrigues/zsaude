# TTS Integration — ElevenLabs + Google

Voz do totem e do painel. Um provedor global escolhido pelo sys, vozes
selecionáveis por escopo (município → unidade → painel/totem). Cache
agressivo por fragmento pra zerar custo em chamadas repetidas.

---

## 1. Problema

Hoje o painel usa `window.speechSynthesis` (TTS do browser). Barato mas
robótico e inconsistente entre dispositivos. Queremos:

- Áudio natural, consistente, em todos os devices.
- Fazer frases compostas: *"Atenção! Senha P-001, guichê 1"* ou
  *"Atenção! Igor Justino Rodrigues, guichê 1"*.
- **Zero API call em conteúdo repetido**: "Atenção!", nomes de guichês,
  nomes de pacientes já atendidos antes — tudo cacheado.
- Reproduzir sequencialmente sem cortar a chamada anterior quando uma
  nova chega.

---

## 2. Arquitetura geral

```
┌──────────────┐   POST /rec/tts/prepare      ┌──────────────────┐
│ Frontend     │ ────────────────────────────▶│ Backend TTS      │
│ painel/totem │   body: [ticket, name, ...]  │ service          │
└──────┬───────┘                              └──────┬───────────┘
       │                                             │
       │                                     ┌───────▼────────┐
       │                                     │ Para cada      │
       │                                     │ fragmento:     │
       │                                     │  - hash(text)  │
       │                                     │  - existe no   │
       │                                     │    bucket?     │
       │                                     │     ├─ sim: URL│
       │                                     │     └─ não:    │
       │                                     │        gera +  │
       │                                     │        salva   │
       │                                     └───────┬────────┘
       │       resposta: [ {url, duration?}, ... ]   │
       │◀────────────────────────────────────────────┘
       │
       ▼
  AudioQueue.enqueue(urls)
   - HTMLAudioElement
   - toca em sequência
   - novas chamadas entram na fila, não cortam
```

### Provedores

Abstração `TtsProvider` com:
```python
class TtsProvider(Protocol):
    async def synthesize(self, text: str, voice_id: str, lang: str = "pt-BR") -> bytes
    async def list_voices(self) -> list[Voice]   # pra o MASTER mostrar as opções
```

Implementações iniciais: `ElevenLabsProvider`, `GoogleTtsProvider`.

**Provider escolhido é global** (sys decide). Não faz sentido misturar
vozes de provedores diferentes entre unidades (mantém previsibilidade
de custo + latência).

---

## 3. Banco + Storage

### Tabelas (schema `app`)

#### `tts_provider_keys`
Credenciais, scoped por município (ou global). Só MASTER edita.

```
id, provider ('elevenlabs'|'google'),
scope ('global'|'municipality'), scope_id (nullable),
api_key_encrypted, extra_config JSONB,  -- ex.: google usa service_account JSON
active BOOLEAN,
created_at, updated_at
```

Global = default. Município pode sobrescrever se tem contrato próprio.

#### `tts_voices`
Catálogo de vozes disponíveis. Sys puxa via `list_voices()` do provedor
e deixa o admin **marcar quais estão disponíveis** pra escolha (nem toda
voz do ElevenLabs precisa aparecer).

```
id,                         -- UUID
provider ('elevenlabs'|'google'),
external_id,                -- ID no provedor (voice_id do 11labs, pt-BR-Wavenet-C do google)
name,                       -- "Antoni (Grave, Masculino)"
language ('pt-BR'),
gender ('male'|'female'|'neutral'|null),
description,                -- livre
sample_url,                 -- preview opcional
archived BOOLEAN,
available_for_selection BOOLEAN,  -- admin liga/desliga
created_at, updated_at
UNIQUE(provider, external_id)
```

#### `tts_audio_cache`
Cada fragmento gerado. Content-addressed pelo hash do texto + voz.

```
id UUID,
provider, voice_external_id, lang,
text,                              -- o texto original (pra debug/re-gen)
text_hash CHAR(64),                -- sha256 do text+voice+lang normalizados
storage_key,                       -- "tts/{provider}/{voice}/{hash}.mp3"
file_size, duration_ms (nullable),
fragment_kind,                     -- 'static' | 'ticket' | 'name' | 'counter'
ref_count INTEGER,                 -- quantas vezes foi usado (pra cleanup)
created_at, last_used_at
UNIQUE(text_hash)
```

Storage reutiliza o `get_storage()` já existente (MinIO/S3). TTL infinito
— fragmentos nunca expiram. Job de cleanup opcional: remove se
`last_used_at < 90 days AND ref_count == 0` (pra nomes de pacientes que
não retornam).

### Seções novas no `rec_config`

```ts
{
  painel: {
    ...,
    voiceId: UUID | null,    // nulo = herda (defaults → mun → unidade)
  },
  totem: {
    ...,
    voiceId: UUID | null,
  }
}
```

Cascata atual (`defaults → município → unidade`) serve. Por-painel e
per-totem como override individual: o campo `voice_id` no próprio
`painels`/`totens` (nullable — null = herda).

---

## 4. Fragmentação (o truque do caching)

Cada frase é decomposta em **tokens**. Cada token vira um fragmento
cacheado separado. A frase tocada é a concatenação de áudios.

### Tokens fixos (gerados 1x e reusados sempre)

| Token | Texto |
|---|---|
| `alert` | "Atenção!" (com pausa) |
| `senha` | "senha" |
| `prioridade` | "prioridade" |
| `guiche` | "guichê" |
| `balcao` | "balcão" |
| `letter.A` … `letter.Z` | "a", "bê", "cê", …, "zê" (fonético lento) |
| `digit.0` … `digit.9` | "zero", "um", "dois", … |
| `num.1` … `num.50` | "um", "dois", …, "cinquenta" (pra guichês comuns — inteiros) |
| `comma` / `period` | pausas de conexão (opcional, ou via `<break>` SSML) |

Aprox. **~90 fragmentos fixos por voz**. Gerados no boot do sistema ou
sob demanda no primeiro uso.

### Tokens dinâmicos

| Token | Exemplo | Estratégia |
|---|---|---|
| `ticket` | "P-001", "R-047" | Cache pelo **valor completo** (reuso quando a senha volta a aparecer ao longo do dia). Hash = `sha256(text+voice)`. |
| `name` | "Igor Justino Rodrigues" | Cache pelo hash do nome normalizado (trim + case-fold + sem acentos variantes? depende — decidir). |
| `counter` | "Guichê 5", "Balcão Acolhimento" | Cache pelo texto completo. Normalizados a partir do `counter` configurado. |

Pra **ticket**, alternativa: decompor em `letter.P + digit.0 + digit.0 + digit.1`.
Reusa fragmentos fixos → custo zero após o bootstrap. **Recomendo essa**
pros tickets (espaço de possibilidades enorme, letras/dígitos são 30
fragmentos fixos vs gerar milhares de combinações).

Nomes e guichês permanecem cacheados pelo valor completo.

### Composição das frases

Modo `senha` (só senha):
```
[alert] [senha] [letter.P] [digit.0] [digit.0] [digit.1] [comma]
[guiche] [num.1]
```

Modo `nome` (só nome):
```
[alert] [name:Igor Justino Rodrigues] [comma] [guiche] [num.1]
```

Modo `ambos`:
```
[alert] [name:Igor Justino Rodrigues] [comma] [senha] [letter.P] [digit.0] [digit.0] [digit.1] [comma] [guiche] [num.1]
```

Totem tem frases curtas próprias: "bem-vindo", "aguarde", "sua senha
é…", "obrigado" etc. — mesma mecânica, token set diferente.

---

## 5. Endpoints

### Admin MASTER

```
GET   /api/v1/admin/tts/providers                  → lista provedores disponíveis
POST  /api/v1/admin/tts/providers/{p}/keys         → salva credencial
DELETE /api/v1/admin/tts/providers/{p}/keys
POST  /api/v1/admin/tts/providers/{p}/keys/test    → valida credencial
POST  /api/v1/admin/tts/voices/sync                → puxa catálogo do provedor
GET   /api/v1/admin/tts/voices                     → lista (paginada)
PATCH /api/v1/admin/tts/voices/{id}                → toggle available_for_selection
GET   /api/v1/admin/tts/voices/{id}/preview        → devolve áudio de amostra
POST  /api/v1/admin/tts/settings                   → setar qual provider está ativo globalmente
```

### Runtime

**Preparação em batch** (a cada chamada nova OU na abertura do painel, pra
pre-cache):

```
POST /api/v1/rec/tts/prepare
Auth: device (painel/totem) OU user
Body: {
  voiceId?: UUID,           // null = usa o efetivo do escopo
  utterances: [
    {
      kind: 'call',
      tokens: [
        { type: 'static', key: 'alert' },
        { type: 'name', value: 'Igor Justino Rodrigues' },
        { type: 'static', key: 'comma' },
        { type: 'counter', value: 'Guichê 1' }
      ]
    }
  ]
}
Response: {
  utterances: [
    { urls: ['https://.../alert.mp3', 'https://.../name/abc.mp3', ...], totalMs?: 3200 }
  ]
}
```

Frontend toca os URLs em sequência. Backend:
1. Resolve cada token → text
2. Consulta `tts_audio_cache` por `text_hash`
3. Miss → chama provider, salva no storage, grava row
4. Devolve URLs presignadas (S3) ou públicas

### Pre-cache (opcional)

```
POST /api/v1/admin/tts/prewarm
Auth: MASTER
Body: { voiceId: UUID }
Action: gera todos os ~90 fragmentos fixos da voz se faltarem
```

Útil depois de trocar a voz global pra evitar latência na primeira
chamada.

---

## 6. Frontend — reprodução

### Hook `useAudioQueue`

```ts
interface AudioQueue {
  enqueue(urls: string[]): void
  clear(): void              // emergências (ex: silêncio solicitado)
  onEnd?: () => void
}
```

Implementação:
- Array interno `pending: string[]`
- Um `HTMLAudioElement` singleton (ou Web Audio)
- `onended` → shift do pending → next
- Se `enqueue` chega durante play → apenda; **nunca corta**
- Debounce/defer `clear()` apenas via evento explícito (silêncio)

### Integração no painel

- Substitui `usePainelAnnouncer` atual (speech synth)
- Listener de `painel:call` → monta tokens conforme `painel.mode` +
  `hasRealName(patientName)` → `POST /rec/tts/prepare` → `enqueue`
- Listener de `painel:silence` → `clear()` + toca overlay de silêncio.
  Opcional: ter um token `silence_message` ("Por favor, silêncio") pra
  tocar junto.

### Integração no totem

Totem é mais interativo. Pontos úteis de áudio:
- Saudação inicial ("Bem-vindo, toque pra começar")
- Guia ao digitar CPF ("Digite seu CPF")
- Confirmação da senha ("Sua senha é P zero zero um, aguarde sua
  chamada")

Cada frase decomposta igual ao painel. Toca com `useAudioQueue` próprio
do totem (singleton separado).

---

## 7. Resiliência — garantir que tudo toca

Cenários a tratar:

| Cenário | Estratégia |
|---|---|
| Fragmento não está no cache e API falha | Fallback pro `speechSynthesis` do browser pra aquele token. Log do erro. |
| Provider caiu geral | `/rec/tts/prepare` devolve 503 → frontend cai totalmente no speech synth antigo (hook atual preservado como fallback). |
| Conexão lenta no device | URLs assinadas com cache-control longo + `<link rel=preload as=audio>` dos próximos. |
| Duas chamadas em < 1s | Fila garante execução sequencial. Nenhum corte. |
| Silêncio solicitado no meio de uma chamada | `clear()` da fila + stop do atual. Overlay aparece. Chamadas seguintes continuam vindo normalmente. |
| Browser bloqueia autoplay | Painel pede interação inicial 1x (splash "Toque pra começar") — libera `AudioContext`. Device pareado não tem esse problema depois da 1ª interação. |
| Mesma chamada chega 2x via WS (reconnect) | Idempotência por `callId`/`ticket + at` — descarta duplicata no store. |

---

## 8. Custos — estimativa grosseira

ElevenLabs Turbo v2 (pt-BR): ~$0.30 / 1k chars. Cenário típico:

- 90 fragmentos fixos × ~15 chars = 1.4k chars = **$0.42 por voz, 1x**
- Ticket novo ("P-001") ~7 chars = $0.002 — com decomposição fica 0
- Nome novo ~25 chars = $0.0075 por nome novo

Unidade com 200 atendimentos/dia, 150 nomes únicos/dia:
- Dia 1: 150 × $0.0075 = **$1.12/dia**
- Dia 30 (tudo cacheado, paciente recorrente): ~20 nomes novos/dia = **$0.15/dia**

Google Cloud TTS é mais barato (~$4/1M chars), mas qualidade ElevenLabs
é sensivelmente melhor. Admin decide.

---

## 9. Fases de entrega

### Fase 1 — fundação
- Migration `tts_provider_keys`, `tts_voices`, `tts_audio_cache`
- `rec_config` com `voiceId` em painel/totem
- Provider abstract + ElevenLabs + Google (mock/skeleton se necessário)
- `POST /rec/tts/prepare` com fragmentação básica (alert/senha/letter/digit/guiche/num + ticket decomposto + nome cacheado)
- Frontend: `useAudioQueue` + integração no painel substituindo `usePainelAnnouncer`
- Fallback `speechSynthesis` quando API falha
- Cache simples — um bucket, URLs presignadas

### Fase 2 — admin
- Tela `/sys/tts` com abas: Provedor, Credenciais, Vozes, Preview
- `POST /admin/tts/voices/sync` pra puxar catálogo do provedor
- Preview de voz no admin (samples)
- Seletor de voz no `rec_config` de município/unidade (UI)
- Seletor per-painel e per-totem (override)

### Fase 3 — totem
- Integração no totem (saudação, instruções, confirmação de senha)
- Pack de fragmentos do totem (próprio)
- UX: microfone animado quando tocando, botão mute temporário

### Fase 4 — otimizações
- `POST /admin/tts/prewarm` — gera todos os fragmentos fixos da voz ativa
- `<link rel=preload>` dos próximos fragmentos na fila
- Cleanup job: remove fragmentos não usados há > 90 dias
- Métricas: cache hit rate, custo por dia, fragmentos mais requisitados

### Fase 5 — avançado (opcional)
- SSML: suporte a `<break>`, `<emphasis>` na composição
- Múltiplos idiomas (pt-BR + outros) quando necessário
- A/B de vozes com medição de clareza (taxa de paciente atendido sem reconvocação)

---

## 10. Decisões a tomar

1. **Texto dos tickets**: decompor em letras/dígitos fonéticos (reuso
   total) OU cache do valor inteiro (simpler, custo marginal)?
   → recomendo decomposto. Impacto: muda como o token set é definido.

2. **Normalização de nomes**: "Ana L. Ferreira" == "Ana Lúcia Ferreira"?
   → recomendo **não normalizar**: hash do texto exato. Garante que o
   áudio confira 100% com o que aparece no painel.

3. **Onde armazenar ref_count**: update a cada uso (write amplification)
   ou só updated_at?
   → `last_used_at` basta; ref_count era bonus.

4. **URLs presignadas vs públicas**: MinIO pode servir com signed URLs
   de TTL longo (7d). Mais seguro que público. Frontend cacheia
   localmente enquanto a URL vale.
   → signed URLs de 7d, renovar transparente.

5. **Fallback speech synth**: manter `usePainelAnnouncer` como fallback
   ou remover?
   → manter como camada degradada. Liga automático se `POST /prepare`
   retornar erro.

6. **Per-painel/totem voice override**: fazer na fase 2 ou 1?
   → fase 2 (admin first, escopo município/unidade basta no início).

---

## 11. Checklist mínimo da Fase 1 (o que precisa rodar)

- [ ] Migration (3 tabelas + voiceId no rec_config)
- [ ] Models + schemas
- [ ] Provider abstract
- [ ] ElevenLabs adapter (sintetizar + listar vozes + test key)
- [ ] Google TTS adapter
- [ ] Service `tts_service` com: `synthesize_or_cache(token)`,
  `build_call_utterance(ticket, name, counter, mode, voice)`,
  `presign(storage_key)`
- [ ] Endpoint `POST /rec/tts/prepare`
- [ ] Seed de vozes (ou instrução no README pra rodar o sync depois)
- [ ] Hook `useAudioQueue` no frontend
- [ ] Integração no painel (`RecPainelPage` + `DevicePainelPage`)
- [ ] Tratamento de erro com fallback speech synth
- [ ] Log/audit: cada chamada ao provider (chars enviados, custo estimado, cache hit/miss)

---

## 12. Gaps que ficam pra depois

- **Métricas de custo no dashboard**: contador por município/dia.
- **Rate limiting por voice** pra evitar rajadas acidentais na API.
- **Vozes customizadas** (ElevenLabs permite clonagem — não vamos usar).
- **Interrupção inteligente**: prioridade extrema interrompe? (hoje: não,
  nunca corta).
- **Reprodução offline** em totens com cache local agressivo.
