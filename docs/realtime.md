# Tempo real (WebSocket + Valkey pub/sub)

Infra genérica pra eventos real-time entre backend e clientes. Dois
hubs convivem com a mesma shape:

| Hub | Indexado por | Canal Valkey | Quem se conecta |
|---|---|---|---|
| **`DeviceHub`** | `(facility_id, device_id)` | `device:fac:{facility_id}` | Totens e painéis pareados |
| **`UserHub`** | `(user_id, conn_id)` | `user:{user_id}` | Usuários autenticados (navegadores) |

Ambos seguem o mesmo padrão: WS native do FastAPI + `PSUBSCRIBE` no
Valkey + fan-out local. Diferença é só a chave de indexação e o canal.

---

## 1. Arquitetura

```
┌──────────────┐  PUBLISH   ┌──────────────┐  pmessage   ┌──────────────┐
│ Qualquer     │ ─────────▶│ Valkey canal │ ─────────▶ │ Hub (worker) │
│ worker/req   │   JSON     │ (device:/user:│             │  subscribed  │
│              │           │   padrão)    │             │  psubscribe  │
└──────────────┘           └──────────────┘             └──┬───────────┘
                                                           │ fan-out
                                                           ▼
                                                       WebSockets
                                                       conectados neste
                                                       worker
```

- Cada **worker/processo** do FastAPI tem sua **própria instância** do hub
  com um dicionário em memória de conexões.
- Uma task `asyncio` por hub faz `PSUBSCRIBE {prefixo}*` no Valkey na
  subida (lifespan).
- Quando qualquer worker publica → Valkey replica pra todos os subscribers
  → cada hub faz fan-out local pras WSs dele que interessam.

**Escala horizontalmente**: N workers/pods só precisam acessar o mesmo
Valkey. Sem sticky sessions, sem roteamento especial no load balancer.

---

## 2. DeviceHub

Arquivo: `app/modules/devices/hub.py`. Detalhes completos em
[`devices.md`](./devices.md).

Indexado por `facility_id → {device_id: WebSocket}`. Um device do mesmo
`device_id` conectando de novo **fecha a conexão anterior** (close code
`1008 replaced`) — evita leak.

**API:**

```python
from app.modules.devices.hub import get_hub, publish_facility_event

# Publica de qualquer lugar:
await publish_facility_event(
    valkey, facility_id, "painel:call", {"ticket": "R-047", ...}
)
```

**Eventos hoje:**

| Evento | Origem | Consumidor |
|---|---|---|
| `painel:call`    | `POST /api/v1/rec/calls` | Painéis da unidade |
| `device:revoked` | `DELETE /api/v1/devices/{id}` | Device alvo (compara deviceId) |

---

## 3. UserHub

Arquivo: `app/modules/users/hub.py`. Adicionado quando notificações
migraram pra real-time.

Indexado por `user_id → {conn_id: WebSocket}`. **Múltiplas conexões por
usuário** são OK (várias abas, celular + desktop) — todas recebem os
eventos.

**Endpoint:** `WS /api/v1/users/ws?token=<access_token>` (JWT de user).

```python
from app.modules.users.hub import get_user_hub, publish_user_event

# Publica de qualquer lugar (ex.: depois de criar notif):
await publish_user_event(valkey, user_id, "notification:new", {...})
```

**Eventos hoje** (notificações):

| Evento | Publicado por | Payload |
|---|---|---|
| `notification:new`       | `NotificationService.notify()` | `{id, type, category, title, message}` |
| `notification:read`      | `mark_read()` | `{id}` |
| `notification:all-read`  | `mark_all_read()` | `{}` |
| `notification:dismissed` | `dismiss()` | `{id}` |

O `NotificationService` recebe `valkey` opcional no constructor — se
vier, publica; se não, silencioso (comportamento fallback pra jobs
batch que não importam real-time).

---

## 4. Eventos no frontend

### Devices

Hook `useDeviceSocket` (`hooks/useDeviceSocket.ts`):

```tsx
useDeviceSocket({
  onEvent: ({ event, payload }) => {
    if (event === 'painel:call') { /* ... */ }
    if (event === 'device:revoked' && payload.deviceId === myDeviceId) reset()
  },
  onUnauthorized: () => reset(),  // 4401 = token inválido/revogado
})
```

URL do WS é resolvida por `VITE_API_URL` (se absoluto, convertido pra
`ws://`; senão usa `window.location.host`).

### Users

Hook `useUserSocket` (`hooks/useUserSocket.ts`):

```tsx
useUserSocket({
  onEvent: ({ event }) => {
    if (event.startsWith('notification:')) void refreshNotifications()
  },
})
```

Reconexão com backoff exponencial (1s → 30s). Em 4401, espera 5s e
tenta de novo — na prática, o `authStore` renova o access silenciosamente
antes disso, o effect reroda com token novo.

---

## 5. Lifespan (startup/shutdown)

Em `app/main.py` (função `lifespan`):

```python
device_hub = init_hub(_valkey_client())
user_hub = init_user_hub(_valkey_client())
await device_hub.start()
await user_hub.start()

try:
    yield
finally:
    await device_hub.stop()
    await user_hub.stop()
```

Cada `start()` dispara a task `PSUBSCRIBE`. `stop()` cancela a task,
fecha todas as WSs com code `1001`.

---

## 6. Sessões e TTLs

### User

- **Access token** (JWT): 15min. Renovado silenciosamente via refresh
  (em `api/client.ts` quando uma request recebe 401).
- **Refresh token**: 30 dias. Rotação com family_id e replay detection.
- **Work context**: 30 dias (era 8h antes). Guarda município + unidade +
  CBO selecionados. Não é credencial, é operacional — faz sentido durar
  tanto quanto o refresh.

### Device

- **Device token**: **sem TTL**. Revoga manualmente via `DELETE /devices/{id}`
  ou "Desconectar" na UI. Totens/painéis 24/7 não deslogam sozinho.

---

## 7. Presença (online/offline)

### Modelo

Linha em `app.user_sessions` com `last_seen_at` atualizado a cada
request (throttled a **10s** por sessão via Valkey key `session:touch:{family_id}`).

Janela de "online": **30s**. `last_seen_at < now - 30s` ou `ended_at
not null` → offline.

### Dedupe por `(user_id, ip)`

Mesmo user com várias abas/sessões no mesmo IP = **1 login**. IPs
distintos do mesmo user = logins separados.

Implementado em:

- `SessionService.count_online()` — conta tuplas distintas (user, ip).
- `SessionService.presence()` — `DISTINCT ON (user_id, ip)` com a
  sessão mais recente de cada tupla.

Endpoints:

| Método | Path | |
|---|---|---|
| `GET` | `/api/v1/users/me/session/active` | Própria sessão + se é online |
| `GET` | `/api/v1/users/presence` | Lista de online (query `scope=actor`, `municipalityId=X`) |

### Limitações conhecidas

- Fechar aba não sinaliza offline instantâneo — fica até expirar a
  janela de 30s. Pode-se melhorar detectando `WebSocketDisconnect` no
  `UserHub` e forçando `last_seen_at = now - 30s`.
- Polling do TopBar ainda roda a cada 15s pra refrescar a lista de
  online (não migrou pra WS — ganho incremental pequeno, custo
  relativo alto).

---

## 8. Onde publicar eventos

Regra prática:

| Situação | Canal | Quem recebe |
|---|---|---|
| Algo acontece **numa unidade** que afeta hardware físico dela | `device:fac:{id}` | Todos os devices pareados à unidade |
| Algo acontece **pro user X** (notificação, alerta pessoal) | `user:{id}` | Todas as abas desse user |

Não existe (hoje) canal "global" ou "por município de todos os users".
Se precisar, generalizar o hub pra aceitar chave arbitrária é ~50 linhas.

---

## 9. Gaps / evoluções possíveis

- **Heartbeat no WS**: browser pausa timers em abas background, mas
  mantém o socket. Um `ping` do backend a cada 30-60s ajudaria a
  detectar conexões zumbis.
- **Presence via hub**: o `UserHub.online_user_ids()` já existe;
  `/users/presence` podia consultar o hub ao invés da tabela
  `user_sessions` (detecção sub-segundo, sem depender da janela de
  30s). Não fiz agora pra evitar regressão.
- **Generalizar hubs**: um `ScopedHub<KeyT>` parametrizado cabe os
  dois casos + facilita criar canais novos (ex.: `municipality:{id}`,
  `sector:{id}`). Hoje são duas classes quase idênticas.
- **Reconexão otimista**: quando o WS do user cai e o refresh ainda
  não aconteceu, esperamos 5s. Podia consultar o `authStore` pra ver
  se tem token novo e reconectar imediatamente.
