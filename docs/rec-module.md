# Módulo Recepção (`rec`)

Módulo que abraça três funções habilitáveis por unidade:

1. **Totem** — autoatendimento: paciente se identifica (face, CPF/CNS ou cadastro
   mínimo) e retira uma senha.
2. **Balcão / Atendimento** — console da atendente: lista a fila real, chama,
   atende, encaminha pra um setor.
3. **Painel de chamadas** — TV pública com senha/nome atual + histórico +
   alerta sonoro + aviso de silêncio.

Totem e painel rodam como **dispositivos pareados** ([`devices.md`](./devices.md)):
abrem URLs públicas (`/dispositivo/totem`, `/dispositivo/painel`), exibem um
código/QR de pareamento, e um usuário autenticado na unidade os vincula.

---

## 1. Três camadas de configuração

| Camada | Pergunta que responde | Escopo | Arquivo principal |
|---|---|---|---|
| **`rec_config`** | A unidade **tem** cada feature ligada + qual o **comportamento padrão**? | Município ↘ Unidade (cascata) | `app/modules/rec/schemas.py` |
| **Setores / Painéis / Totens** | Quais **instâncias nomeadas** existem pra uso? | Município (templates) + Unidade (próprios) | `app/modules/{sectors,painels,totens}` |
| **`devices`** | Qual **hardware físico** está rodando qual instância? | Facility + `painel_id`/`totem_id` | `app/modules/devices/` |

`rec_config` decide se a feature **existe** e **como** se comporta; os catálogos
decidem **quantos e quais** existem; o device decide **qual instância** aquela
TV/tablet física exibe.

---

## 2. `rec_config` — features + políticas comportamentais

JSONB em `municipalities.rec_config` e `facilities.rec_config`. `NULL` = herdar.

```ts
{
  totem:    { enabled: boolean },
  painel:   {
    enabled: boolean,
    mode: 'senha' | 'nome' | 'ambos',  // como a chamada aparece na TV
  },
  recepcao: {
    enabled: boolean,
    afterAttendanceSector: string | null,  // setor sugerido no encaminhar
    forwardSectorNames: string[] | null,   // subset que aparece no modal (null = todos)
    queueOrderMode: 'fifo' | 'priority_fifo' | 'ai',
  },
}
```

**Cascata**: `defaults → município → unidade`. Unidade **só pode restringir** o
flag `enabled` (se o município desliga, a unidade não religa). Os demais
campos cada escopo sobrescreve livremente.

### `painel.mode` — exibição da chamada

- **`senha`** (default): número gigante na TV.
- **`nome`**: nome do paciente em destaque; se vazio ou `"Anônimo"` → cai pra senha.
- **`ambos`**: **nome é o protagonista** (gigante) + senha menor acima como
  etiqueta. Mesmo fallback pro `"Anônimo"`.

A mesma regra vale pro TTS (`usePainelAnnouncer`): paciente sem nome útil
volta a falar "senha…".

### `recepcao.queueOrderMode` — ordenação da fila

- **`fifo`**: ordem de chegada, ignora prioridade.
- **`priority_fifo`**: intercala 2 prioritários : 1 normal (`_interleave` em
  `attendances/service.py`).
- **`ai`**: scoring ponderado — marca *"IA"* na UI mas é uma heurística
  explicável (não ML). Pesos:

  | Sinal | Peso |
  |---|---|
  | `priority_legal` (paciente prioritário) | +0.50 |
  | `wait_normalized` (linear até 30min) | até +0.30 |
  | `wait_overshoot` (exponencial após 45min — anti-starvation) | até +0.25 |
  | `handover_pendente` | +0.10 |
  | `fairness_cap` (≥3 prioritários em voo) | −0.15 |

  Cada ticket carrega um array `orderReasons` que a UI mostra num tooltip
  (ícone ℹ️) pra a atendente ver "por que esse antes daquele".

### `recepcao.forwardSectorNames`

Lista de setores (por nome) que aparecem no modal **Encaminhar**.
`null` = todos; lista explícita = só esses. Configurado em
`/sys/{mun|unidade}/modulos/rec/recepcao` com checklist + atalhos
"Todos"/"Limpar".

### Endpoints

| Método | Path | Efeito |
|---|---|---|
| `GET` | `/api/v1/admin/rec/config/municipalities/{id}` | Config crua. |
| `PATCH` | `/api/v1/admin/rec/config/municipalities/{id}` | Merge parcial — envia só a seção a atualizar. |
| `DELETE` | `/api/v1/admin/rec/config/municipalities/{id}/{section}` | Limpa uma seção (volta a herdar). |
| `GET` | `/api/v1/rec/config/effective?municipalityId=&facilityId=` | Efetivo pós-merge. |

Mesmo padrão pra `/facilities/{id}`.

---

## 3. Recursos: Setores, Painéis, Totens

Entidades nomeadas em `app.schema`, scoped por município ou unidade.

### `sectors`
Catálogo de destinos (Cardiologia, Laboratório, Sala de RX, …). Campos:
`name`, `abbreviation`, `display_order`, `archived`. Drag-and-drop pra
reordenação.

- Facility tem `custom_sectors: bool`. `false` = herda município; `true` =
  tem lista própria (o toggle **clona** a lista do município pra facility).
- Movimentações guardam **snapshot do nome do setor**, não FK. Renomear
  não quebra histórico.

### `painels`
Cada TV é uma entidade lógica: `name`, `sector_names` (filtro de quais
setores aparecem), `announce_audio`, `archived`. O campo `mode` ainda
existe no modelo mas **hoje o valor vem do `rec_config.painel.mode`**
(propagado pelo backend na hora de servir o config do device) — deixou o
per-painel como override futuro.

### `totens`
Config nomeada do autoatendimento: `name`, `capture` (cpf/cns/face/manual_name),
`priority_prompt`, `default_sector_name` (se preenchido, a senha pula a
recepção e nasce já em `sector_waiting`), e numeração personalizável:

```ts
numbering: {
  ticketPrefixNormal: 'R',     // ex.: R-001
  ticketPrefixPriority: 'P',   // ex.: P-001
  resetStrategy: 'daily' | 'weekly' | 'monthly' | 'never',
  numberPadding: 1..6,
}
```

Contador persistido em `app.totem_counters` com `(totem_id, prefix, period_key)`;
`SELECT FOR UPDATE` garante sequência sem gaps.

### UI MASTER

`/sys/municipios/:id/recursos` e `/sys/unidades/:id/recursos` → {Setores,
Painéis de chamada, Totens}.

---

## 4. Vínculo device → instância lógica

Ver [`devices.md`](./devices.md). Resumo do vínculo:

- `devices.painel_id` XOR `devices.totem_id` (check constraint).
- No pair, admin escolhe opcionalmente a instância lógica.
- Sem vínculo → tela **"Aguardando configuração"** em polling de 10s.
- Editar depois: `PATCH /devices/{id}` com `painelId`/`totemId` (ou `null`
  pra desvincular).

---

## 5. Fluxo do totem

```
1. Saudação (data/hora local, logo/rodapé da unidade)
      │
      ├─► "Me identificar"  ───► Captura facial (MediaPipe auto) 
      │                           │
      │                           ├─ match único ≥ 0.60 → "Você é X?"
      │                           │     (mostra foto do cadastro + CPF/CNS mascarados
      │                           │      + activeTicket info se já tá na fila)
      │                           │        │
      │                           │        ├─ Sim → priority → emit  ─┐
      │                           │        └─ Não → document_input    │
      │                           │                                   │
      │                           └─ sem match / múltiplos / baixa conf
      │                                   │                           │
      │                                   ▼                           │
      │                            Document (CPF ou CNS)              │
      │                                   │                           │
      │                                   ▼                           │
      │                       POST /rec/doc-lookup                    │
      │                          ┌─── encontrou? ───┐                 │
      │                          │                   │                 │
      │                          ▼                   ▼                 │
      │                    "Você é X?"        Nome (cadastro mínimo)   │
      │                          │                   │                 │
      │                          └──────┬────────────┘                 │
      │                                 ▼                              │
      │                            Prioridade ─────────────────────────┤
      │                                                                │
      └─► "Sem identificar" ───► Prioridade ─────────────────────────► POST /rec/tickets
                                                                       │
                                                                       ▼
                                                            ┌─── 409 mesma unidade?
                                                            │         │
                                                            │         ▼ sim
                                                            │   "Já está na fila" (mostra senha existente)
                                                            │
                                                            └─► senha emitida
                                                                 + handover info (se outra unidade)
                                                                 + learning (foto → embedding)
                                                                        │
                                                                        ▼
                                                             Tela de sucesso (senha gigante)
```

### Reconhecimento facial + learning contínuo

- **Detector**: MediaPipe `blaze_face_short_range` client-side. Captura
  automática quando o rosto fica **estável por 1s**. Sem botão.
- **Match**: `POST /rec/face-match` (device auth) usa `hsp.face_service.match`
  (insightface/buffalo_l via pgvector/HNSW). Top-5 com filtro de
  `min_detection_score` e `match_threshold`. A UI do totem só confirma se
  vier **1 candidato único com similaridade ≥ 0.60**.
- **Learning**: após identidade confirmada (via face OU via doc), o totem
  chama `POST /rec/face-enroll` em fire-and-forget — gera novo
  `PatientPhoto` vinculado e faz UPSERT do embedding. Uma ref garante **1
  enroll por visita** (não duplica se match + emit acontecem em sequência).
- **Anti-spoofing**: `enroll_from_photo` compara a foto nova com o
  embedding atual do próprio paciente. Se similaridade < 0.40
  (`hsp.face.self_change_threshold`), **NÃO atualiza o embedding**, marca
  `patient_photos.flagged=true` e seta `patients.identity_review_needed=true`
  com motivo `face_mismatch_totem`. A recepção revisa via
  `GET /hsp/patients/{id}/photos` e limpa com `POST /hsp/patients/{id}/identity-review/clear`.
- **Paciente mínimo auto-criado**: se o doc/CPF/CNS digitado no totem
  não existe em `patients`, o backend cria um registro mínimo com nome +
  doc + prontuário sequencial. A recepção completa os demais dados depois.

### Numeração

- `app.totem_counters` com `SELECT FOR UPDATE`.
- `period_key` calculado no **timezone do município**.
- Prefixo depende de `payload.priority` (normal vs prioritário).

---

## 6. Fluxo da recepção (balcão)

Rota: `/rec/atendimento`. Polling a 5s de `GET /rec/tickets` (ordenação
aplicada pelo backend conforme `queueOrderMode`).

### Seções

1. **Em atendimento** — topo fixo, senhas em `reception_attending`.
2. **Aguardando** — `reception_waiting` + `reception_called`. Ordem vem
   do backend (FIFO/intercalado/scoring).
3. **Encaminhados** — `triagem_waiting`, `sector_waiting` — só leitura.

### Ações por linha

| Botão | Status permitido | Endpoint |
|---|---|---|
| **Chamar** / **Rechamar** | waiting / called | `POST /rec/tickets/{id}/call` + `POST /rec/calls` (publica no painel) |
| **Atender** | waiting / called (não precisa passar por call antes) | Abre modal `AttendModal` → `POST /rec/tickets/{id}/start` |
| **Encaminhar** | attending | Abre modal `ForwardModal` → `POST /rec/tickets/{id}/forward` |
| **Confirmar presença** | com `needsHandoverFromAttendanceId` | `POST /rec/tickets/{id}/assume-handover` — fecha o antigo como `evasion` na outra unidade |

Botão X (cancelar) foi **removido da UI** — cancelar é decisão com mais
peso, não merece acessível por 1 clique. Continua no backend se precisar.

### `ForwardModal`

- Lista setores efetivos da unidade, filtrados por
  `recepcao.forwardSectorNames` (se null, mostra todos).
- **Sugerido** pelo admin (`afterAttendanceSector`) vem pré-selecionado
  com badge "Sugerido" (âmbar).
- Se o setor sugerido foi desativado, ele ainda aparece na lista pra não
  criar estado inconsistente — com aviso.

### Cooldown anti-duplo-clique

- Botões **Chamar/Rechamar** e **Solicitar silêncio** ficam desabilitados
  por **5s** após o clique, com contagem regressiva ("Aguarde 3s").
- Implementação: `callCooldowns: Record<ticketId, timestamp>` +
  re-render via `setInterval` de 1s.

### Configuração do guichê (client-side)

Botão **Configurar guichê** no topo. Persistido em `localStorage` por
computador. Campos:

- **Nome** (texto livre) — vai junto na chamada (`CallInput.counter`).
  Se vazio, o painel não mostra linha de guichê.
- **Prioritário** (bool) — badge visual pra a atendente lembrar de
  priorizar; não filtra a fila (o scoring já respeita `priority_legal`).

### Novo atendimento (walk-in)

Rota: `/rec/atendimento/novo`. Botão **+ Novo atendimento** (teal) no
topo da fila. Três abas de busca:

1. **CPF/CNS** — `hspApi.lookup`
2. **Nome + data nasc + mãe** — `hspApi.lookup` com combinação
3. **Reconhecimento facial** — reusa `FaceRecognitionModal` do HSP

Cada resultado vira um card com foto, checkbox prioridade e botão
**Iniciar atendimento** → `POST /rec/tickets/manual` (user auth). O
backend reusa a numeração do primeiro totem da unidade (fallback
município). Atendimento nasce direto em `reception_attending` (a
atendente já tá na frente do paciente), exceto se o totem tem
`default_sector_name` (aí vai pra `sector_waiting`).

### Solicitar silêncio

Botão ao lado de "Novo atendimento" → `POST /rec/silence` → publica
`painel:silence` no canal da unidade. Todas as TVs exibem overlay de
tela cheia por **6s** com:

- Ícone 🔇 gigante + anéis pulsando ao fundo
- **"SILÊNCIO"** em 12vw + "por favor" abaixo
- Fundo escuro com blur

---

## 7. Fluxo de uma chamada (painel)

```
Recepção clica "Chamar"
        │
        ▼
  POST /rec/tickets/{id}/call  (transição DB)
        │
        ▼
  POST /rec/calls (publica no painel)
        │
        ▼
  Valkey PUBLISH device:fac:{facility_id}
  event: "painel:call" | "painel:silence" | "attendance:status-changed"
        │
        ├── (fan-out via pub/sub) ───┐
        ▼                              ▼
  DeviceHub worker 1              DeviceHub worker N
        │ broadcast local              │
        ▼                              ▼
  WS clients daquela facility
        │ onmessage
        ▼
  DevicePainelPage.onEvent:
    - painel:call    → liveCallStore.push
    - painel:silence → liveCallStore.requestSilence
    - device:revoked → reset pareamento
        │
        ▼
  RecPainelPage re-renderiza
    - current com animação de flash
    - modo (senha/nome/ambos) do rec_config.painel.mode
    - overlay de silêncio enquanto dura
    - TTS se announce_audio=true
```

### Propriedades

- **Real-time**: latência sub-100ms.
- **Broadcast por facility**: N TVs na mesma unidade recebem simultâneo.
- **Multi-worker transparente**: Valkey pub/sub sincroniza entre workers.
- **Filtro por `sector_names`**: configurável por painel lógico. O
  payload do `POST /rec/calls` ainda não carrega setor — filtro
  efetivamente passivo até a recepção começar a mandar `sector`.

### TTS (`usePainelAnnouncer`)

`window.speechSynthesis` em pt-BR. Respeita `mode`:

- `senha` → "senha R zero quatro sete, Guichê 2"
- `nome` → "Ana Lúcia Ferreira, Guichê 2"
- `ambos` → "Ana Lúcia Ferreira, senha R zero quatro sete, Guichê 2"

Fallback: paciente com nome `"Anônimo"` ou vazio cai no modo `senha`
mesmo se o global for `nome`/`ambos`. Não repete `id` já anunciado.
Cancela fala anterior ao vir uma nova.

### Footer dinâmico

Header do painel mostra **nome real da unidade + município/UF**, vindo
de `GET /rec/device/facility-info` (device auth).

---

## 8. Endpoints do runtime

### Device auth (X-Device-Token)

| Método | Path | Efeito |
|---|---|---|
| `POST` | `/rec/tickets` | Totem emite senha |
| `POST` | `/rec/doc-lookup` | Totem busca paciente por CPF/CNS |
| `POST` | `/rec/face-match` | Totem busca paciente por rosto |
| `POST` | `/rec/face-enroll` | Totem aprende foto nova (learning) |
| `GET` | `/rec/patients/{id}/photo` | Foto do paciente (confirmação no totem) |
| `GET` | `/rec/device/facility-info` | Info da unidade pro rodapé |

### User auth (JWT + work-context)

| Método | Path | Efeito |
|---|---|---|
| `GET` | `/rec/tickets` | Lista fila da unidade (ordenada) |
| `POST` | `/rec/tickets/manual` | Recepção cria atendimento walk-in |
| `POST` | `/rec/tickets/{id}/call` | Chama no painel + transiciona |
| `POST` | `/rec/tickets/{id}/start` | Inicia atendimento |
| `POST` | `/rec/tickets/{id}/forward` | Encaminha pra setor |
| `POST` | `/rec/tickets/{id}/cancel` | Cancela com motivo |
| `POST` | `/rec/tickets/{id}/assume-handover` | Confirma presença (handover) |
| `POST` | `/rec/calls` | Publica chamada no painel |
| `POST` | `/rec/silence` | Solicita silêncio no painel |

### HSP (gerenciamento do paciente)

| Método | Path | Efeito |
|---|---|---|
| `POST` | `/hsp/patients/{id}/identity-review/clear` | Recepção valida identidade |
| `PATCH` | `/hsp/patients/{id}/photos/{photo_id}/flag?flagged=` | Marca/desmarca foto suspeita |
| `GET` | `/hsp/patients/{id}/photos` | Galeria completa |

---

## 9. Páginas frontend

### Autenticadas

| Path | Componente | Descrição |
|---|---|---|
| `/rec` | `RecHomePage` | Dashboard + atalhos |
| `/rec/atendimento` | `RecQueuePage` | Console da atendente (polling 5s) |
| `/rec/atendimento/novo` | `RecNewAttendancePage` | Walk-in: busca multi-critério + face |
| `/rec/totem` | `RecTotemPage` | Totem embutido (admin) |
| `/rec/painel` | `RecPainelPage` | Preview do painel |
| `/rec/dispositivos` | `RecDevicesPage` | Parear/editar/revogar devices |

### Públicas (devices)

| Path | Componente |
|---|---|
| `/dispositivo/totem` | `DeviceTotemPage` |
| `/dispositivo/painel` | `DevicePainelPage` |
| `/dispositivos/parear?code=X&type=Y` | `RecDevicePairPage` |

### Admin MASTER

| Path | Conteúdo |
|---|---|
| `/sys/municipios/:id/modulos/rec/{totem,painel,recepcao}` | Config do `rec_config` + seletores de modo/ordenação/setores |
| `/sys/municipios/:id/recursos/{setores,paineis,totens}` | Catálogos nomeados |
| `/sys/unidades/:id/...` | Mesma shape pra facility |

### HSP (gerenciamento da identidade)

- **Banner de revisão** em `HspPatientDetailPage` quando
  `identity_review_needed=true` — com CTA "Validar identidade" (limpa
  flag) + botão "Abrir galeria".
- **`PhotoGalleryModal`**: grid de todas as fotos do paciente com:
  - Badge **Oficial** na `current_photo_id` (ring azul)
  - Badge **Suspeita** nas `flagged` (ring vermelho)
  - Meta: uploader (Totem vs usuário) + data
  - Ações por foto: **tornar oficial** / **marcar/desmarcar suspeita**
- **Badge "Revisar"** na lista de busca e no header do detalhe.

---

## 10. Tabelas principais (tenant schema)

### `attendances`

```
id, facility_id, device_id (nullable), ticket_number,
priority, doc_type, doc_value, patient_name, patient_id (nullable),
status, sector_name (se aplicável),
needs_handover_from_attendance_id (nullable),
arrived_at, called_at, started_at, forwarded_at, cancelled_at,
{called,started,forwarded,cancelled}_by_user_id,
cancellation_reason
```

Status (CHECK constraint):
`reception_waiting, reception_called, reception_attending, sector_waiting,
triagem_waiting, cancelled, evasion`

`ACTIVE_STATUSES` (no model) = todos exceto `cancelled`/`evasion`.

### `patients` (relevantes pro módulo)

```
id, prontuario, name, social_name, cpf, cns,
current_photo_id (nullable, FK patient_photos),
identity_review_needed (bool, default false),
identity_review_reason (string, nullable),
identity_review_at (timestamp, nullable),
...
```

### `patient_photos`

```
id, patient_id, file_id (nullable, FK files),
mime_type, file_size, uploaded_by, uploaded_by_name, uploaded_at,
flagged (bool, default false)
```

Foto do totem: `uploaded_by_name = "Totem: {device.name or device.id}"`,
`uploaded_by = NULL`. Quando `patient.current_photo_id IS NULL`, o
primeiro enroll promove a foto a oficial automaticamente.

### `patient_face_embeddings`

UNIQUE por `patient_id` (1:1). Busca via HNSW index (pgvector).
Threshold de duplicata: 0.70 (`hsp.face.duplicate_threshold`).
Threshold de self-change: 0.40 (`hsp.face.self_change_threshold`).

---

## 11. Permissões e módulos

- `rec.module.access` — abre o módulo; no `operator_base` do seed.
- `rec` entra em `OPERATIONAL_MODULES` do backend.
- `hsp.patient.edit` necessária pra limpar flag de identity review.
- `hsp.patient_photo.upload` pra togglar flag de foto suspeita.

---

## 12. Migrations do módulo

### Schema `app`

| Revision | Efeito |
|---|---|
| `0052_rename_cha_to_rec` | Renomeia módulo. |
| `0053_rec_config` | JSONB `rec_config`. |
| `0054_devices` | Tabela devices. |
| `0055_sectors` | Tabela sectors scoped. |
| `0056_painels` | Tabela painels scoped. |
| `0057_totens` | Tabela totens scoped. |
| `0058_device_links` | `devices.painel_id/totem_id` + XOR. |
| `0059_totem_numbering` | `ticket_prefix_*`, `reset_strategy`, `number_padding` + `totem_counters`. |
| `0060_totem_default_sector` | `totens.default_sector_name`. |
| `0061_sector_reception_flag` | **Reverted** — adicionou `available_in_reception` (substituído por `forward_sector_names` no rec_config). |
| `0062_drop_sector_rec_flag` | Remove a flag acima. |

### Schema tenant

| Revision | Efeito |
|---|---|
| `t0009_attendances` | Cria tabela `attendances`. |
| `t0010_attendance_sector_status` | Adiciona `sector_waiting` no CHECK. |
| `t0011_identity_review` | `patients.identity_review_*` + `patient_photos.flagged` + índice parcial. |

---

## 13. Estratégia de ordenação (`ai` mode) — evolução

Hoje é heurística explicável (§2). Plano:

- **Fase 2**: UI de pesos configuráveis (perfis "Equilibrado" / "Prioridade
  estrita" / "Throughput") + sliders no avançado.
- **Fase 3**: telemetria (`wait_p50/p95`, starvation events) por município
  pra justificar escolha de perfil.
- **Fase 4**: componente preditivo opcional — `service_time` por tipo de
  atendimento quando tiver histórico. Continua determinístico, só adiciona
  um sinal no score.

---

## 14. Gaps conhecidos

- **Atendimento conclusivo**: `recepcao.afterAttendanceSector` hoje é só
  sugestão no `ForwardModal`. Falta um fluxo "concluir aqui" (sem
  encaminhar) — precisaria de um novo status tipo `completed`.
- **Per-painel `mode`** ignorado: o campo existe na tabela mas o device
  config já injeta o `rec_config.painel.mode`. Pra ter override real
  precisaria de `mode: nullable` com semântica "null = herdar".
- **Filtro de setor no `POST /rec/calls`**: payload ainda não carrega
  setor; `painel.sectorNames` fica passivo.
- **Rechamada com penalidade**: o scoring tem espaço pra descontar score
  de tickets já chamados que não compareceram, mas não está implementado.
- **Perfis e UI de pesos** (scoring): hoje os pesos são constantes no
  código (`AI_W_*`).
- **Multi-ticket do mesmo paciente no dia**: nenhum ajuste específico.
