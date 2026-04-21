# Dispositivos e tempo real

Sistema de **pareamento de dispositivos** (totens e painéis de chamadas)
+ canal **WebSocket + Valkey pub/sub** pra eventos em tempo real entre
o sistema e esses dispositivos.

O padrão é genérico: hoje usado só pelo módulo Recepção, mas
reaproveitável por outras features que precisem de hardware dedicado na
unidade (ex.: balcão de triagem, painel da farmácia).

---

## 1. Conceito

Um **device** é um navegador público rodando em um hardware dedicado
(tablet na parede pro totem, TV com navegador pro painel). Ele não tem
usuário logado — a autenticação acontece via **device token**, emitido
uma vez no pareamento.

Ciclo de vida:

```
┌──────────┐     register    ┌─────────┐   admin pair    ┌────────┐
│ device   │ ───────────────▶│ pending │ ──────────────▶ │ paired │
│ (browser)│ ◀───────────────│  code   │                 │  token │
└──────────┘   pairing code  └─────────┘                 └────────┘
                                                              │
                                                              ▼
                                                         ┌─────────┐
                                                         │ revoked │
                                                         └─────────┘
```

Estados implícitos na tabela (não há coluna `status`):

| Estado | `pairing_code` | `token_hash` | `revoked_at` |
|---|:-:|:-:|:-:|
| **pending** | ≠ NULL | NULL | NULL |
| **paired** | NULL | ≠ NULL | NULL |
| **revoked** | — | NULL | ≠ NULL |

A property `Device.status` deriva essa string pra exibição.

---

## 2. Schema

Migration: `0054_devices`. Tabela `app.devices`:

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` | PK. Conhecido só pelo device — usado pra polling. |
| `type` | `varchar(20)` | `'totem'` ou `'painel'` (check constraint). |
| `facility_id` | `uuid → facilities` | `NULL` enquanto pending; setado no pair. |
| `name` | `varchar(120)` | Nome amigável (setado pelo admin). |
| `pairing_code` | `varchar(10)` | Código de 6 chars; unique partial index. `NULL` após pair. |
| `pairing_expires_at` | `timestamptz` | Quando o code expira (default 10min). |
| `paired_at` | `timestamptz` | Momento do pair. |
| `paired_by_user_id` | `uuid → users` | Quem pareou. |
| `token_hash` | `varchar(64)` | SHA-256 do device token; unique partial. |
| `last_seen_at` | `timestamptz` | Atualizado no WS ao conectar. |
| `revoked_at` | `timestamptz` | Momento da revogação. |
| `revoked_by_user_id` | `uuid → users` | Quem revogou. |

### Handoff do token via Valkey

O token em **plaintext** nunca é persistido. Ele é emitido no
`POST /devices/pair`, escrito em `device:handoff:{id}` no Valkey com
TTL de 120s, e devolvido no próximo polling de status. Se o device não
buscar em 2min, perde — o admin precisa revogar e o device registrar
de novo.

Trade-off: não é possível "reemitir" o token de um device já pareado.
Se o admin fecha o navegador do totem antes do primeiro polling, a única
saída é revogar e reparear. Na prática acontece raramente.

---

## 3. Endpoints

### Público (sem auth — usados pelo device)

| Método | Path | Efeito |
|---|---|---|
| `POST` | `/api/v1/public/devices/register` | Body: `{type}`. Retorna `{deviceId, pairingCode, pairingExpiresAt}`. |
| `GET`  | `/api/v1/public/devices/status/{device_id}` | Polling do device. Status: `pending \| paired \| revoked \| stale`. Quando vira `paired`, devolve `deviceToken` **uma vez** (via Valkey handoff). |

### Autenticado (qualquer usuário com work-context)

| Método | Path | Efeito |
|---|---|---|
| `POST`   | `/api/v1/devices/pair` | Body: `{code, type, facilityId, name}`. `facilityId` precisa bater com o work-context (403 se não). |
| `GET`    | `/api/v1/devices` | Lista devices (pareados + pendentes + revogados dos últimos 30 dias) da unidade atual. |
| `DELETE` | `/api/v1/devices/{id}` | Revoga. Emite evento `device:revoked` no canal da unidade — devices conectados fecham o WS. |

### WebSocket

```
wss://<host>/api/v1/devices/ws?token=<device_token>
```

- Autenticação: query param `token`. Token inválido → close `4401`.
- Sem `facility_id` no device → close `4400`.
- Após accept: registro no `DeviceHub` indexado por `(facility_id,
  device_id)`. Conexão prévia do mesmo device é fechada com `1008
  replaced`.
- Mensagens do cliente: ignoradas por enquanto (o browser mantém alive
  via frames de controle).
- Mensagens do servidor: JSON `{event, payload}`.

---

## 4. Hub WebSocket + Valkey pub/sub

Arquivo: `app/modules/devices/hub.py`.

```
┌──────────────┐  publish    ┌──────────────┐  pmessage   ┌──────────────┐
│ Qualquer     │─────────────▶ Valkey canal │─────────────▶ DeviceHub    │
│ worker/req   │  JSON       │ device:fac:X │             │ (por worker) │
└──────────────┘             └──────────────┘             └───┬──────────┘
                                                              │ fan-out
                                                              ▼
                                                          WebSockets
                                                          da facility X
```

- **Canal Valkey** por unidade: `device:fac:{facility_id}`.
- Em startup (`app/main.py::lifespan`), chamamos `init_hub()` e
  `hub.start()`: um `asyncio.Task` faz `PSUBSCRIBE device:fac:*` e
  repassa cada `pmessage` pras conexões WS locais do facility.
- Escalável horizontalmente — cada worker/replica só precisa conhecer
  as WS conectadas nele. O Valkey sincroniza.

### Publicar um evento

```python
from app.modules.devices.hub import publish_facility_event
await publish_facility_event(
    valkey, facility_id, "painel:call", {"ticket": "R-047", ...}
)
```

### Eventos registrados hoje

| Evento | Origem | Consumidor | Payload |
|---|---|---|---|
| `painel:call` | `POST /rec/calls` (console do balcão) | Painéis da unidade | `{ticket, counter, patientName, priority, at}` |
| `device:revoked` | `DELETE /devices/{id}` | Device específico | `{deviceId}` — o cliente compara e reseta se for ele |

---

## 5. Frontend — device

### Store `deviceStore.ts`

Zustand com `persist()` em `localStorage` (chave `zs-device`). Guarda:

- `deviceId` — conhecido só por este navegador.
- `deviceToken` — token opaco emitido no pair.
- `type`, `name`, `facilityId` — snapshot do pareamento.

Actions: `beginPairing`, `completePairing`, `reset`.

### Hook `useDeviceSocket.ts`

Abre `WebSocket` contra `/api/v1/devices/ws?token=…` quando há
`deviceToken`. Reconecta com backoff exponencial (1s → 30s). Se o
servidor retorna close `4401`, chama `onUnauthorized` e **não** tenta
de novo — o device provavelmente foi revogado.

### Telas

```
/dispositivo/totem   → DeviceTotemPage
/dispositivo/painel  → DevicePainelPage
```

Ambas são URLs **públicas** (fora do `RequireAuth`). O componente:

1. Se não tem `deviceToken`: renderiza `DevicePairingScreen` — registra
   (`POST /public/devices/register`), exibe o código em letra gigante,
   faz polling de status a cada 2s.
2. Ao receber `status: paired` com `deviceToken`, guarda no store e
   muda para o modo operacional (reusa `RecTotemPage` ou `RecPainelPage`).
3. Abre o WebSocket via `useDeviceSocket`:
   - `device:revoked` (com `deviceId` matching) → `reset()` — volta pro
     pareamento.
   - `painel:call` (só no painel) → `liveCallStore.push()` — o
     `RecPainelPage` é reativo a esse store.

### Store `liveCallStore.ts`

Simples zustand com `current` e `history` (últimas 4). Single source of
truth do painel — o `RecPainelPage` lê daqui. Modo preview autenticado
(`/rec/painel`) mostra "Aguardando próxima chamada…" até alguém chamar.

---

## 6. Frontend — admin

Página **`RecDevicesPage`** em `/rec/dispositivos`:

- **Listar**: cards com ícone (totem/painel), nome, quem pareou, data,
  badge **Conectado** + "visto por último".
- **Parear**: modal com input do código (auto-uppercase, font mono
  grande), seletor de tipo, nome, e a unidade vinculada ao work-context
  atual.
- **Revogar** (cada linha): confirm → `DELETE`. Aparece na seção
  "Revogados (últimos 30 dias)" abaixo.

Item correspondente no menu lateral: **Recepção → Administração →
Dispositivos**.

---

## 7. Testando ponta a ponta

1. Em uma aba **sem login** (ou anônima): abrir
   `http://localhost:<port>/dispositivo/painel`. Código de 6 chars
   aparece em letra enorme.
2. Em outra aba logada com work-context numa unidade: **Recepção →
   Dispositivos → Parear dispositivo**. Digitar o código, tipo `painel`,
   nome qualquer.
3. Em até 2s, a aba do painel sai do pareamento e mostra "Aguardando
   próxima chamada…".
4. Abrir `/rec/atendimento` e clicar **"Chamar próximo"**. A senha
   aparece na tela do painel imediatamente (flash verde).
5. Voltar em Dispositivos, clicar **"Desconectar"** no painel → a aba
   do painel volta pro modo pareamento com um código novo.

---

## 8. Extensões futuras

- **Heartbeat/presença**: atualmente `last_seen_at` é atualizado só no
  connect. Pode-se adicionar um `PING` periódico e marcar
  online/offline com cutoff (ex.: 90s sem ping = offline).
- **Autenticação do device no WS pós-handshake**: hoje o token vem na
  query (aparece em logs de proxy). Mover pra um `HELLO` frame após
  `accept()` se o ambiente for sensível.
- **Outros eventos**: `config:changed` (unidade alterou rec_config →
  devices recarregam), `totem:issue_ticket` (device → server → console
  recebe), `device:name-updated`.
- **Escalar o canal**: hoje é um canal por facility. Se uma facility
  grande tiver centenas de devices, partir em subcanais por tipo
  (`device:fac:{id}:painel`, `device:fac:{id}:totem`).
