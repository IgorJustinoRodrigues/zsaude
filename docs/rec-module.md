# Módulo Recepção (`rec`)

Módulo que abraça três funções habilitáveis por unidade:

1. **Totem** — autoatendimento: paciente se identifica e retira uma senha.
2. **Balcão / Atendimento** — console da atendente: ver fila, chamar próxima, encaminhar.
3. **Painel de chamadas** — TV pública com senha atual + histórico + alerta sonoro.

Totem e painel rodam como **dispositivos pareados** ([`devices.md`](./devices.md)):
abrem URLs públicas (`/dispositivo/totem`, `/dispositivo/painel`), exibem um
código/QR de pareamento, e um usuário autenticado na unidade os vincula.

---

## 1. Três camadas de configuração

A configuração do módulo é dividida em três níveis complementares. Entender
essa separação é o atalho mais curto pra não se perder no código:

| Camada | Pergunta que responde | Escopo | Arquivo principal |
|---|---|---|---|
| **`rec_config`** | A unidade **tem** totem/painel/atendimento ligados? | Município ↘ Unidade (cascata) | `app/modules/rec/schemas.py` |
| **Setores, Painéis, Totens** | Quais **instâncias nomeadas** existem pra uso? | Município (templates) + Unidade (próprios) | `app/modules/{sectors,painels,totens}` |
| **`devices`** | Qual **hardware físico** está rodando qual instância? | Facility + vínculo `painel_id`/`totem_id` | `app/modules/devices/` |

Ou seja: `rec_config` decide se a feature **existe** naquele escopo; os
catálogos (painéis/totens) decidem **quantos e como** são; e o device
decide **qual instância específica** aquela TV/tablet físico exibe.

---

## 2. `rec_config` — enable/disable + defaults comportamentais

JSONB em `municipalities.rec_config` e `facilities.rec_config`. `NULL` =
herdar; dict parcial = sobrescreve as chaves enviadas.

```ts
{
  totem:    { enabled: boolean },
  painel:   { enabled: boolean },
  recepcao: { enabled: boolean, afterAttendance: 'triagem'|'consulta'|'nenhum' },
}
```

Cascata: `defaults → município → unidade`. Unidade **só pode restringir** —
se o município desliga totem, a unidade não consegue religar (enforçado no
backend com 409; UI tranca o toggle).

**Histórico**: versões anteriores tinham `capture`, `priority_prompt`,
`mode`, `announce_audio` dentro do `rec_config`. Esses campos **migraram**
pras entidades nomeadas (ver §3): agora cada **totem lógico** tem sua
própria `capture`/`priority_prompt`, e cada **painel lógico** tem seu
`mode`/`announce_audio`. O `rec_config` ficou reduzido aos flags de
feature e ao `afterAttendance` (que é política do módulo, não de uma
instância específica).

### Endpoints

| Método | Path | Efeito |
|---|---|---|
| `GET`    | `/api/v1/admin/rec/config/municipalities/{id}` | Config crua. |
| `PATCH`  | `/api/v1/admin/rec/config/municipalities/{id}` | Merge parcial — envia só a seção que quer atualizar. |
| `DELETE` | `/api/v1/admin/rec/config/municipalities/{id}/{section}` | Limpa uma seção (volta a herdar). |
| `GET`    | `/api/v1/rec/config/effective` | Efetivo pro runtime (work-context). |

Idem para `/facilities/{id}`.

### UI MASTER

`/sys/municipios/:id/modulos → Recepção → {Totem, Painel, Atendimento}`.
Cada seção tem um `MasterToggle` destacado e os campos específicos do
nível (hoje: só os toggles `enabled` + `afterAttendance`).

---

## 3. Recursos: Setores, Painéis, Totens

Entidades nomeadas que vivem em `app.schema`, **scopedas** por município
ou unidade:

| Tabela | Propósito | Campos-chave |
|---|---|---|
| `sectors` | Catálogo de setores ("Cardiologia", "RX", …) pra encaminhamentos e filtros de painel | `name`, `abbreviation`, `display_order`, `archived` |
| `painels` | Configuração nomeada do que a TV exibe | `name`, `mode` (senha/nome/ambos), `announce_audio`, `sector_names` (JSONB array snapshot), `archived` |
| `totens` | Configuração nomeada do autoatendimento | `name`, `capture` (cpf/cns/face/manual_name), `priority_prompt`, `archived` |

Unique `(scope_type, scope_id, name)` em todas.

### Cascata "solta"

- **Setores**: facility tem flag `custom_sectors`. `false` = herda município;
  `true` = tem lista própria (o primeiro toggle **clona** a lista do município
  pra facility, daí pode editar livremente; voltar a herdar apaga as rows
  da facility).
- **Painéis e totens**: sem flag. A facility **sempre** vê próprios +
  herdados do município. O admin pode criar próprios; não desliga um
  herdado específico (se precisar, arquiva no município).

Movimentações (chamadas, emissões de senha) guardam **snapshot do nome**
do setor, não FK — renomear um setor não quebra histórico.

### Endpoints (admin MASTER)

```
/admin/sectors/municipalities/{id}/sectors         GET/POST
/admin/sectors/facilities/{id}/sectors             GET/POST
/admin/sectors/facilities/{id}/customize           POST    (clona do município)
/admin/sectors/facilities/{id}/uncustomize         POST    (volta a herdar)
/admin/sectors/{id}                                PATCH/DELETE
/admin/sectors/.../sectors/reorder                 POST    (nova ordem por drag)

/admin/painels/municipalities/{id}/painels         GET/POST
/admin/painels/facilities/{id}/painels             GET/POST
/admin/painels/{id}                                PATCH/DELETE

/admin/totens/...                                  mesma shape dos painéis
```

### Endpoints de runtime

```
GET /api/v1/sectors/effective     (work-context)
GET /api/v1/painels/available     (work-context; próprios + herdados c/ flag inherited)
GET /api/v1/totens/available      (idem)
```

### UI MASTER

`/sys/municipios/:id/recursos → {Setores, Painéis de chamada, Totens}`.
Mesma shape em `/sys/unidades/:id/recursos`. **Setores** tem drag-and-drop
pra reordenação (HTML5 native). **Painéis** têm multi-select de setores
(vem da lista efetiva do escopo).

---

## 4. Vínculo device → instância lógica

Ver [`devices.md`](./devices.md) pra o ciclo completo do pareamento.
Aqui só o resumo do vínculo:

- `devices.painel_id` e `devices.totem_id` (um OU outro, nunca os dois
  — check constraint `ck_devices_link_xor`).
- No pair (`POST /devices/pair`), admin informa opcionalmente o
  `painel_id`/`totem_id` escolhido entre os **disponíveis na facility**.
- Não vinculou? Device mostra **"Aguardando configuração"** (tela
  `DeviceWaitingConfigScreen`) e fica em polling de 10s no `/public/devices/config`.
- Editar vínculo depois: `PATCH /devices/{id}` aceita `painelId`/`totemId`
  (inclusive `null` pra desvincular).

---

## 5. Fluxo de uma chamada

```
┌───────────────────────┐
│ Console de Recepção   │  (usuário autenticado em /rec/atendimento)
│  clica "Chamar X"      │
└────────────┬───────────┘
             │
             ▼
  POST /api/v1/rec/calls
  body: {ticket, counter, patientName, priority}
  → usa ctx.facility_id do work-context
             │
             ▼
┌───────────────────────┐
│ Backend: rec.router   │
│  publica evento       │
└────────────┬───────────┘
             │
             ▼
  Valkey PUBLISH canal  device:fac:{facility_id}
  payload: {"event": "painel:call", "payload": {ticket, ...}}
             │
             ├────────── (fan-out via pub/sub) ──────────┐
             ▼                                             ▼
┌──────────────────┐                        ┌──────────────────┐
│ DeviceHub (w1)   │                        │ DeviceHub (wN)   │
│ subscribed:      │                        │ subscribed:      │
│  device:fac:*    │                        │  device:fac:*    │
└────────┬─────────┘                        └────────┬─────────┘
         │ broadcast local                             │
         ▼                                             ▼
┌──────────────────┐                        ┌──────────────────┐
│ WS conectados    │                        │ WS conectados    │
│ daquela facility │                        │ daquela facility │
└────────┬─────────┘                        └──────────────────┘
         │ onmessage
         ▼
  DevicePainelPage.onEvent === 'painel:call'
         │
         ├─ (opcional) filtra por painel.sectorNames
         │
         ▼
  liveCallStore.push(novaChamada)
         │
         ▼
  RecPainelPage re-renderiza: mostra senha grande + guichê + nome
         │
         └─ usePainelAnnouncer (se announce_audio=true)
            → window.speechSynthesis.speak()
```

### Propriedades do fluxo

- **Real-time** — latência sub-100ms.
- **Broadcast por facility** — N TVs na mesma unidade recebem simultâneo.
- **Multi-worker transparente** — pub/sub sincroniza entre workers.
- **Filtro por setor** existe na UI (`DevicePainelPage` verifica
  `config.painel.sectorNames`) mas o payload do `POST /rec/calls`
  **ainda não envia `sector`** — filtro efetivamente não-bloqueante
  hoje. Quando o console de atendimento ganhar escolha de destino, o
  campo entra no payload e o filtro começa a recortar.
- **Histórico** dos últimos 4 calls fica no `liveCallStore` (frontend,
  em memória — não persistido). Ao abrir painel novo, começa vazio.

### Áudio (TTS)

Hook `usePainelAnnouncer` (`frontend/src/hooks/usePainelAnnouncer.ts`).
Usa `window.speechSynthesis`. **Passivo quando `announce_audio=false`**
no painel lógico vinculado; ligando no painel (via MASTER) começa a
falar automaticamente. Formato depende de `mode`:

- `senha`  → "senha R zero quatro sete, Guichê 2"
- `nome`   → "Ana Lúcia Ferreira, Guichê 2"
- `ambos`  → "Ana Lúcia Ferreira, senha R zero quatro sete, Guichê 2"

Não repete a mesma chamada (guarda `id` já anunciado). Cancela fala
anterior ao vir uma nova.

### Testar

Botão **"Testar chamada"** em `/rec/atendimento` (roxo, borda
tracejada). Gera ticket + nome aleatórios (pool de 16 nomes fictícios)
e chama `POST /rec/calls`. Útil pra validar ponta-a-ponta sem depender
da fila real.

---

## 6. Páginas

### Autenticadas

| Path | Componente | Descrição |
|---|---|---|
| `/rec` | `RecHomePage` | Dashboard com métricas e atalhos. |
| `/rec/atendimento` | `RecQueuePage` | Console da atendente: fila mock + chamar próximo + testar chamada. |
| `/rec/totem` | `RecTotemPage` | Preview do totem dentro do app (admins testando). |
| `/rec/painel` | `RecPainelPage` | Preview do painel; lê do `liveCallStore`. |
| `/rec/dispositivos` | `RecDevicesPage` | Listar/parear/editar/revogar devices da unidade atual. |

### Públicas (URLs dos devices)

| Path | Componente | Descrição |
|---|---|---|
| `/dispositivo/totem` | `DeviceTotemPage` | Totem pareado ou tela de pareamento (código + QR). |
| `/dispositivo/painel` | `DevicePainelPage` | Painel pareado (com WS + `liveCallStore`) ou tela de pareamento. |
| `/dispositivos/parear?code=X&type=Y` | `RecDevicePairPage` | Confirmação de pareamento via QR (mobile). |

---

## 7. Permissões e módulos habilitados

- `rec.module.access` — abre o módulo pro usuário. Atribuída ao
  `operator_base` no seed (ver `app/core/permissions/seed.py`).
- `rec` entra em `OPERATIONAL_MODULES` do backend; `Municipality.enabled_modules = NULL`
  inclui tudo por default.

---

## 8. Migrations do módulo

| Revision | Efeito |
|---|---|
| `0052_rename_cha_to_rec` | Renomeia `"cha"` → `"rec"` em `enabled_modules`. |
| `0053_rec_config` | JSONB `rec_config` em municipalities/facilities. |
| `0054_devices` | Tabela `devices` (ver [`devices.md`](./devices.md)). |
| `0055_sectors` | Tabela `sectors` scoped + flag `facilities.custom_sectors`. |
| `0056_painels` | Tabela `painels` scoped. |
| `0057_totens` | Tabela `totens` scoped. |
| `0058_device_links` | `devices.painel_id` / `devices.totem_id` + check XOR. |

---

## 9. Gaps conhecidos

- **Fila real** — `RecQueuePage` mostra mock hardcoded. Quando o totem
  gerar senhas de verdade no backend, a fila passa a ser consultada da DB.
- **Sector no `POST /rec/calls`** — payload ainda não carrega setor; o
  filtro de painel por `sector_names` fica passivo até isso entrar.
- **Rechamar** — não implementado. Botão "Chamar de novo" fica na wish list.
- **Guichês configuráveis** — hoje `['Guichê 1', 'Guichê 2', 'Guichê 3']`
  hardcoded em `RecQueuePage`. Provável: virar campo na unidade ou
  escolha do usuário no início do turno.
- **Painéis/totens arquivados vs deletados** — o UI tem "arquivar" e
  "excluir", mas `Device.painel_id`/`totem_id` é `ON DELETE SET NULL`:
  deletar um painel lógico faz todos os devices vinculados caírem em
  "Aguardando configuração". Arquivar não afeta vínculo; só some da
  lista de disponíveis nos novos pairs.
