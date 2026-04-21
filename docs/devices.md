# Dispositivos e tempo real

Sistema de **pareamento de dispositivos** (totens e painéis de chamadas)
+ canal **WebSocket + Valkey pub/sub** pra eventos em tempo real.

O padrão é genérico: hoje usado só pelo módulo Recepção, mas
reaproveitável por outras features que precisem de hardware dedicado na
unidade (ex.: balcão de triagem, painel da farmácia).

Para o panorama de WS/pub/sub unificado (DeviceHub + UserHub, eventos,
presença), ver [`realtime.md`](./realtime.md).

---

## 1. Conceito

Um **device** é um navegador público rodando em hardware dedicado
(tablet na parede, TV com Chrome). Não tem usuário logado — autentica
via **device token** emitido uma vez no pareamento.

Ciclo de vida:

```
┌──────────┐   register   ┌─────────┐  admin pair   ┌────────┐
│ device   │─────────────▶│ pending │──────────────▶│ paired │
│ (browser)│◀─────────────│  code   │               │  token │
└──────────┘ pairing code └─────────┘               └────┬───┘
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

A property `Device.status` deriva a string pra exibição.

**Sem TTL** — o `token` opaco de um device pareado não expira por
inatividade. A única forma de perder acesso é revogar manualmente
(botão "Desconectar" na UI). Feito assim porque totens/painéis ficam
24/7 e não faria sentido deslogar sozinho.

---

## 2. Schema

Migrations: `0054_devices` + `0058_device_links`. Tabela `app.devices`:

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` | PK. Conhecido só pelo device (usado em polling). |
| `type` | `varchar(20)` | `'totem'` ou `'painel'` (check constraint). |
| `facility_id` | `uuid → facilities` | `NULL` enquanto pending; setado no pair. |
| `name` | `varchar(120)` | Apelido amigável do hardware. |
| `pairing_code` | `varchar(10)` | Código de 6 chars; unique partial index. `NULL` após pair. |
| `pairing_expires_at` | `timestamptz` | Quando o code expira (default 10min). |
| `paired_at` | `timestamptz` | Momento do pair. |
| `paired_by_user_id` | `uuid → users` | Quem pareou. |
| `token_hash` | `varchar(64)` | SHA-256 do device token; unique partial. |
| `last_seen_at` | `timestamptz` | Atualizado no connect do WS. |
| `revoked_at` | `timestamptz` | Momento da revogação. |
| `revoked_by_user_id` | `uuid → users` | Quem revogou. |
| `painel_id` | `uuid → painels` | **Vínculo lógico** (só pra `type='painel'`). `ON DELETE SET NULL`. |
| `totem_id` | `uuid → totens` | **Vínculo lógico** (só pra `type='totem'`). `ON DELETE SET NULL`. |

Constraint `ck_devices_link_xor`: **só um** dos dois campos
(`painel_id`/`totem_id`) pode estar setado por vez.

### Handoff do token via Valkey

O token em **plaintext** nunca é persistido. Emitido no
`POST /devices/pair`, escrito em `device:handoff:{id}` no Valkey com
TTL de 120s, devolvido no próximo polling de status do device. Se o
device não buscar em 2min, perde — admin revoga e device registra de
novo. Trade-off: não dá pra "reemitir" token de device já pareado.

---

## 3. Fluxo de pareamento

```
  Device abre /dispositivo/{totem|painel}
            │
            ▼ POST /public/devices/register {type}
  Backend: cria row ``pending``, gera code de 6 chars (alfabeto sem ambiguidade)
            │
            ▼ retorna {deviceId, pairingCode, pairingExpiresAt}
  Device exibe code grande + QR code (sub-seção abaixo)
            │
            └──► polling: GET /public/devices/status/{deviceId} (a cada 2s)
                          ou via QR + admin autenticado (caminho curto)
```

### Caminho longo: admin digita o código

Usuário autenticado numa unidade abre `/rec/dispositivos`:

1. Clica **"Parear dispositivo"**
2. Digita o code, escolhe tipo, nome, e **opcionalmente** um painel/totem
   lógico pra vincular
3. `POST /api/v1/devices/pair` com `{code, type, facilityId, name,
   painelId?|totemId?}`
4. Validações:
   - Tipo do payload bate com o tipo registrado
   - `facilityId` == work-context
   - Painel/totem escolhido está **disponível** pra unidade (próprio ou
     herdado do município)
5. Backend gera `device_token`, grava hash, põe plaintext em Valkey handoff

### Caminho curto: QR code do celular

Na tela `/dispositivo/{totem|painel}` aparece também um **QR code**
apontando pra `{origin}/dispositivos/parear?code={code}&type={type}`.

Usuário escaneia com o celular. A `RecDevicePairPage` trata 3 estados:

- **Não logado**: mostra "Precisa estar logado" com link pra `/login`
  (preservando `returnTo` via `location.state`). Após login, volta.
- **Logado sem work-context**: botão "Escolher unidade" redireciona pra
  `/selecionar-contexto` (também preserva `returnTo`).
- **Logado com unidade**: form reduzido (code pre-filled, nome, vínculo
  opcional, confirma).

Em até 2s depois do pair, o próprio device (que está em polling) recebe
`status: paired` com o `deviceToken`, guarda no `localStorage` e entra
no modo operacional.

---

## 4. Vínculo device → painel/totem lógico

Device pareado **pode não ter vínculo** — nesse caso mostra a tela
`DeviceWaitingConfigScreen` ("Aguardando configuração") até o admin
escolher. Dá pra:

1. Escolher no momento do pair (dropdown no modal).
2. Editar depois via `PATCH /api/v1/devices/{id}` com `{name?, painelId?,
   totemId?}`. Aceita `null` explícito pra desvincular.

O device detecta a mudança no próximo polling do endpoint de config
(default 10s). Sem refresh manual.

### Endpoint de config do device

```
GET /api/v1/public/devices/config
Header: X-Device-Token: <plaintext>
```

Retorna:

```jsonc
{
  "deviceId": "...",
  "type": "painel",
  "name": "TV da entrada",
  "facilityId": "...",
  "painel": {                // null se não vinculado
    "id": "...",
    "name": "Painel Emergência",
    "mode": "senha",
    "announceAudio": true,
    "sectorNames": ["Cardiologia", "Ortopedia"]
  },
  "totem": null              // para device type=painel
}
```

Se `painel` e `totem` ambos null → **"Aguardando configuração"**.
Senão → device renderiza o modo operacional (`RecPainelPage` ou
`RecTotemPage`) com a config aplicada.

---

## 5. Endpoints

### Público (sem auth — usados pelo device)

| Método | Path | Efeito |
|---|---|---|
| `POST` | `/api/v1/public/devices/register` | `{type}` → `{deviceId, pairingCode, pairingExpiresAt}`. |
| `GET`  | `/api/v1/public/devices/status/{device_id}` | Polling. Quando paired, devolve `deviceToken` **uma vez**. |
| `GET`  | `/api/v1/public/devices/config` | Com header `X-Device-Token`. Retorna config efetiva (ver §4). |

### Autenticado (usuário com work-context)

| Método | Path | Efeito |
|---|---|---|
| `POST`   | `/api/v1/devices/pair` | Consome code + vincula à facility atual. `painelId`/`totemId` opcionais. |
| `GET`    | `/api/v1/devices` | Lista devices da unidade atual (inclui revogados dos últimos 30d). |
| `PATCH`  | `/api/v1/devices/{id}` | Atualiza nome e/ou vínculo. `null` desvincula. |
| `DELETE` | `/api/v1/devices/{id}` | Revoga. Publica `device:revoked` no canal da facility. |

### WebSocket

```
wss://<host>/api/v1/devices/ws?token=<device_token>
```

- Query param `token` é o `device_token`. Se inválido → close `4401`.
- Device sem `facility_id` → close `4400`.
- Após `accept`: registro em `DeviceHub` indexado por `(facility_id,
  device_id)`. Conexão anterior do mesmo device é fechada com `1008
  replaced`.
- Cliente não manda nada útil pelo WS (só recebe). Reconexão com
  backoff exponencial (1s → 30s).

---

## 6. Eventos no canal do device (Valkey)

Canal: `device:fac:{facility_id}`. Formato: `{"event": "...", "payload": {...}}`.

| Evento | Origem | Consumidor | Payload |
|---|---|---|---|
| `painel:call` | `POST /api/v1/rec/calls` (console do balcão) | Painéis da unidade | `{ticket, counter, patientName, priority, at}` |
| `device:revoked` | `DELETE /api/v1/devices/{id}` | Device alvo | `{deviceId}` — o cliente compara e reseta se for ele |

---

## 7. Frontend — device

### Store `deviceStore.ts`

Zustand com `persist()` em `localStorage` (chave `zs-device`):
- `deviceId` — conhecido só por este navegador
- `deviceToken` — opaque token emitido no pair
- `type`, `name`, `facilityId` — snapshot

Actions: `beginPairing`, `completePairing`, `reset`.

### Hooks

- **`useDeviceSocket`** — abre WS com backoff exponencial. Em 4401,
  não reconecta (device revogado).
- **`useDeviceConfig`** — polling de 10s no `/public/devices/config`.
  Detecta 401 → `reset()`.

### Páginas

```
/dispositivo/totem     DeviceTotemPage
/dispositivo/painel    DevicePainelPage
/dispositivos/parear   RecDevicePairPage   (QR → mobile)
```

`DevicePainelPage` e `DeviceTotemPage` tratam 3 estados:
1. **Sem deviceToken** → `DevicePairingScreen` (code + QR + polling)
2. **Token mas sem vínculo** → `DeviceWaitingConfigScreen`
3. **Token + vínculo** → `RecPainelPage` ou `RecTotemPage` operacional

### Áudio no painel

`usePainelAnnouncer` (`hooks/usePainelAnnouncer.ts`). Fala chamadas novas
usando `window.speechSynthesis`. Passivo por padrão; liga via
`painel.announceAudio=true` no painel lógico vinculado. Ver
[`rec-module.md` §5](./rec-module.md#5-fluxo-de-uma-chamada) pros
detalhes de modo (senha/nome/ambos).

---

## 8. Frontend — admin

`/rec/dispositivos` (`RecDevicesPage`):

- Lista devices da unidade atual (pareados + revogados dos últimos 30d).
- Cada linha: ícone por tipo, nome, badge **"Conectado"** (teal), badge
  com o painel/totem vinculado (violeta) **ou** badge **"Não configurado"**
  (âmbar), info de quem pareou, last-seen.
- Botões: **Editar** (modal: nome + vínculo) e **Desconectar**
  (revoga + emite `device:revoked`).

Modal de pair:
1. Seletor de tipo (**Painel** primeiro, default)
2. Card com QR + URL + botão copiar
3. Input do code
4. Nome
5. Dropdown opcional de painel/totem (da lista efetiva da unidade)

---

## 9. Testando ponta a ponta

1. Em uma aba **sem login**: abrir
   `http://<host>:<port>/dispositivo/painel`. Code + QR aparecem.
2. Noutra aba logada com work-context: **Recepção → Dispositivos →
   Parear dispositivo**. Digitar o code, escolher Painel, nome. (Ou
   escanear o QR do celular.)
3. Em até 2s o device sai do pairing e vai pro modo operacional
   (ou pra "Aguardando config" se não escolheu painel no pair).
4. Abrir `/rec/atendimento` e clicar **"Testar chamada"**.
5. A senha aparece na TV em <100ms + anúncio de voz (se
   `announce_audio=true`).

---

## 10. Extensões futuras

- **Heartbeat/presença do device**: hoje `last_seen_at` só atualiza no
  connect. Adicionar PING periódico do WS pra marcar
  online/offline com cutoff (ex.: 90s sem ping = offline).
- **Evento no WS pós-handshake**: hoje token vai na query (aparece em
  logs de proxy). Mover pra `HELLO` frame após `accept()` quando for
  sensível.
- **Outros eventos**: `config:changed` (unidade alterou config → device
  recarrega), `totem:issue_ticket` (device → server → console), etc.
- **Partition do canal**: hoje um canal por facility. Se uma facility
  tiver dezenas de devices, partir em subcanais por tipo
  (`device:fac:{id}:painel`, `device:fac:{id}:totem`).
- **Notificações de user migram pro UserHub** (já existe infra, ver
  [`realtime.md`](./realtime.md)) — feito.
