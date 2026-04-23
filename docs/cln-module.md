# Módulo Clínico (`cln`)

Módulo que consome atendimentos encaminhados pela recepção e cuida do fluxo
**pós-recepção** até a alta no setor:

1. **Triagem** (opcional) — fila onde o ticket entra antes da consulta.
   Classificação de risco, vitais, queixa principal etc.
2. **Atendimento** — consulta propriamente dita.
3. **Finalização** — alta no setor (status terminal `finished`).

O CLN **não emite senhas** — é sempre a recepção que encaminha (`forward`) e
os tickets caem nas filas CLN conforme o `sector_name` configurado.

---

## 1. Como o CLN descobre os seus tickets

O `Attendance` tem um campo `sector_name` que é setado no encaminhamento da
recepção. O CLN, em cada unidade, configura **quais setores pertencem a ele**:

- `triagem_sector_name` — tickets com esse `sector_name` aparecem na fila de
  Triagem.
- `atendimento_sector_name` — tickets com esse aparecem na fila de Atendimento.

Se a unidade não usa triagem (`triagem_enabled=false`), só o
`atendimento_sector_name` é usado — a recepção encaminha direto pra esse setor.

> **Um módulo CLN por unidade**. Se a unidade atende vários setores clínicos
> (ex.: Clínica Médica + Odontologia), essa é a abordagem: a UI admin
> configura um único setor de atendimento por unidade. Multi-setor dentro do
> mesmo CLN fica pra evolução futura.

---

## 2. `cln_config` — flags + setores

JSONB em `municipalities.cln_config` e `facilities.cln_config`. `NULL` = herda.

```ts
{
  enabled: boolean,               // módulo ativo nesta unidade
  triagemEnabled: boolean,        // fluxo passa por triagem antes do atendimento?
  triagemSectorName: string|null, // setor da fila de triagem (null se triagemEnabled=false)
  atendimentoSectorName: string,  // setor da fila de atendimento (sempre obrigatório)
}
```

### Cascata

**Defaults → município → unidade.** Unidade só restringe o que o município
libera. `EffectiveClnConfig` é o resultado do merge, com `sources` indicando
a origem de cada campo.

### Defaults do sistema

```python
enabled = False
triagem_enabled = True
triagem_sector_name = None
atendimento_sector_name = None
```

Módulo desligado por padrão — cada município decide onde ligar.

### Endpoints admin (MASTER)

```
GET/PATCH  /admin/cln/config/municipalities/{id}
GET/PATCH  /admin/cln/config/facilities/{id}
```

Patch com `{"config": null}` limpa o escopo (volta a herdar). Patch parcial
mescla chave a chave.

### UI admin

`/sys/municipios/:id/modulos/cln/geral` (e facility equivalente) —
`SysClnConfigPage` mostra:

- Toggle "Módulo ativo".
- Toggle "Usar triagem antes do atendimento".
- Select "Setor da triagem" (habilita quando `triagemEnabled=true`).
- Select "Setor do atendimento" (obrigatório).

Lista de setores vem de `sectorsAdminApi.listMunicipality|listFacility`.

---

## 3. Statuses do `Attendance` no ciclo CLN

O modelo `Attendance` tem statuses compartilhados com recepção. Os específicos
do CLN (migration tenant `t0014_cln_statuses`):

| Status | Significado |
|---|---|
| `triagem_waiting` | Recepção encaminhou pra um setor de triagem. Entra na **fila de triagem** do CLN se o `sector_name` casar. |
| `sector_waiting` | Ticket aguardando atendimento (ou veio direto da recepção, quando `triagemEnabled=false`, ou foi liberado pela triagem). Entra na **fila de atendimento**. |
| `cln_called` | Atendente CLN clicou "Chamar" — painel anunciou. |
| `cln_attending` | Atendente CLN clicou "Atender" — consulta/triagem em andamento. |
| `finished` | Terminal — alta no setor. |
| `cancelled` / `evasion` | Terminais comuns. |

> Os statuses são **genéricos** (`cln_*`). Distinguir "triagem" vs "atendimento"
> é via `sector_name` comparado com a config — não há status separado.

### Fluxo visual

```
┌─────────────────────────────────────────────────────┐
│ Recepção encaminha (forward) pra setor X            │
│  ├─ se X == triagemSectorName → triagem_waiting     │
│  └─ se X == atendimentoSectorName → sector_waiting  │
└─────────────────────────────────────────────────────┘
                        │
              ┌─────────┴──────────┐
              │                    │
      [Fila de Triagem]   [Fila de Atendimento]
              │                    │
  Chamar → cln_called      Chamar → cln_called
  Atender → cln_attending  Atender → cln_attending
              │                    │
   Liberar (muda sector_name  Finalizar → finished
   pra atendimentoSectorName;
   status volta pra sector_waiting)
              │
   (entra na fila de atendimento)
```

### Transições

| Ação | De → Para | Endpoint |
|---|---|---|
| Chamar | `triagem_waiting`/`sector_waiting`/`cln_called` → `cln_called` | `POST /cln/tickets/{id}/call` |
| Rechamar | `cln_called` → `cln_called` (só loga `recalled`) | mesmo |
| Atender | `cln_called`/`triagem_waiting`/`sector_waiting` → `cln_attending` | `POST /cln/tickets/{id}/start` |
| Liberar (triagem → atendimento) | `cln_attending`/`cln_called` → `sector_waiting` com novo `sector_name` | `POST /cln/tickets/{id}/release` |
| Finalizar | `cln_attending`/`cln_called` → `finished` | `POST /cln/tickets/{id}/finish` |
| Cancelar | `cancelled` com motivo | `POST /cln/tickets/{id}/cancel` |

Cada transição loga evento na timeline do atendimento
(`attendance_events`) — veja [seção 5](#5-timeline-e-eventos).

---

## 4. Backend

### Estrutura

```
backend/app/modules/cln/
  __init__.py
  schemas.py    ClnConfig, ClnConfigRead/Update, EffectiveClnConfig,
                ClnQueueItem, CancelInput
  service.py    ClnConfigService (config)
                ClnService (filas + ações de ticket)
  router.py     rotas /cln e /admin/cln
```

### `ClnConfigService`

```python
get_for_municipality(id)   → ClnConfigRead   # raw do escopo
get_for_facility(id)       → ClnConfigRead
update_for_municipality(id, payload) → ClnConfigRead
update_for_facility(id, payload)     → ClnConfigRead
effective_for_municipality(id)       → EffectiveClnConfig
effective_for_facility(id, mun_id)   → EffectiveClnConfig  # merge cascata
```

### `ClnService` (filas + ações)

```python
list_triagem(facility_id, triagem_sector_name)      → list[Attendance]
list_atendimento(facility_id, atendimento_sector_name) → list[Attendance]

call(attendance_id, user_id, user_name)
start(attendance_id, user_id, user_name)
release_to_atendimento(attendance_id, user_id, atendimento_sector_name, user_name)
finish(attendance_id, user_id, user_name)
cancel(attendance_id, user_id, reason, user_name)  # delega pro AttendanceService
```

Reaproveita o `AttendanceService` (mesma tenant session) pra:
- `_get_or_404` (404 se não existe)
- `_log_event` (timeline)
- `_publish_status` (evento real-time via Valkey)

As filas sempre incluem os tickets `cln_called` e `cln_attending` cujo
`sector_name` bate — assim quem tá sendo atendido NÃO some da tela do
atendente.

### Router `/cln`

| Endpoint | Permissão | Descrição |
|---|---|---|
| `GET /cln/ping` | autenticado | sanity |
| `GET /cln/config/effective` | context | config efetiva (usa work-context do user) |
| `GET /cln/triagem` | `cln.module.access` | fila de triagem |
| `GET /cln/atendimento` | `cln.module.access` | fila de atendimento |
| `POST /cln/tickets/{id}/call` | `cln.module.access` | chama paciente |
| `POST /cln/tickets/{id}/start` | `cln.module.access` | inicia atendimento |
| `POST /cln/tickets/{id}/release` | `cln.module.access` | triagem → atendimento |
| `POST /cln/tickets/{id}/finish` | `cln.module.access` | finaliza (terminal) |
| `POST /cln/tickets/{id}/cancel` | `cln.module.access` | cancela com motivo |

Todas as ações validam que `att.facility_id == ctx.facility_id` — não dá pra
mexer em ticket de outra unidade.

### Router `/admin/cln`

MASTER only. CRUD da config por escopo (municipalities/facilities).

---

## 5. Timeline e eventos

O CLN reaproveita a tabela `attendance_events` (tenant) do módulo recepção.
Cada transição gera uma linha com `event_type`, `user_id`, `user_name` e
`details` JSONB.

Eventos específicos do fluxo CLN:

| `event_type` | Ação que gera | `details` |
|---|---|---|
| `called` | primeiro clique em "Chamar" | `{ticketNumber, sector}` |
| `recalled` | rechamada (já estava `cln_called`) | mesmo |
| `started` | "Atender" | `{sector}` |
| `forwarded` | triagem → atendimento (reaproveita o tipo forward) | `{sectorName, from, reason: "triagem_completed"}` |
| `finished` | finalização | `{sector}` |
| `cancelled` | cancelamento | `{reason}` |

O componente `AttendanceTimeline` (em `pages/rec/components/`) reconhece
esses tipos automaticamente — ícones e labels em `EVENT_STYLES`. A fila
do CLN mostra um botão de histórico em cada linha que abre um modal com a
timeline completa.

---

## 6. Frontend

### Estrutura

```
frontend/src/
  api/cln.ts                  clnApi + tipos
  pages/cln/
    ClnHomePage.tsx            landing com contadores
    ClnQueuePage.tsx           fila (triagem|atendimento via prop `kind`)
  pages/sys/
    SysClnConfigPage.tsx       admin config MASTER
```

### `clnApi`

```ts
clnApi.effectiveConfig(params?)   // com ou sem facilityId/municipalityId
clnApi.listTriagem()
clnApi.listAtendimento()
clnApi.call(id)
clnApi.start(id)
clnApi.release(id)                // triagem → atendimento
clnApi.finish(id)
clnApi.cancel(id, reason)
clnApi.admin.{getMunicipalityConfig, updateMunicipalityConfig,
               getFacilityConfig, updateFacilityConfig}
```

### `ClnHomePage` (`/cln`)

- Card "Triagem" — aparece se `config.triagemEnabled && config.triagemSectorName`.
- Card "Atendimento" — aparece se `config.atendimentoSectorName`.
- Cada card mostra: setor configurado, contador live da fila, link pra ver.
- Banner amarelo se módulo desativado na unidade.

### `ClnQueuePage` (`/cln/triagem` | `/cln/atendimento`)

Prop `kind: 'triagem' | 'atendimento'` decide:
- Qual endpoint usar (`listTriagem` vs `listAtendimento`).
- Quais ações aparecem.

**Duas seções**:
1. **Em atendimento** — tickets em `cln_called` ou `cln_attending`.
2. **Aguardando** — demais.

**Ações por seção × kind**:

| | Aguardando | Em atendimento |
|---|---|---|
| Triagem | Chamar · Atender | Rechamar · **Liberar** · Cancelar |
| Atendimento | Chamar · Atender | Rechamar · **Finalizar** · Cancelar |

Clique no número da senha ou no nome abre a ficha de atendimento do
paciente (`/rec/atendimento/:patientId`) — mesma tela do wizard da recepção.
O ícone de histórico abre modal com `AttendanceTimeline`.

**Polling**: 5s (`POLL_MS`).

### Sidebar & rotas

Em `components/layout/Sidebar.tsx`:

```ts
cln: [
  { kind: 'section', label: 'Filas' },
  { kind: 'item', icon: <Stethoscope />, label: 'Triagem',     path: '/cln/triagem' },
  { kind: 'item', icon: <Users />,       label: 'Atendimento', path: '/cln/atendimento' },
]
```

Módulo `cln` já existia em `MODULE_META` (cor sky, ícone Stethoscope).

Rotas em `router/index.tsx`:

```
/cln                      → ClnHomePage
/cln/triagem              → ClnQueuePage kind="triagem"
/cln/atendimento          → ClnQueuePage kind="atendimento"
```

Protegido por `RequireModule moduleId="cln"` — o usuário precisa:
- Ter `cln` nos seus `modules` (derivado de `enabled_modules` da unidade).
- Ter permissão `cln.module.access` no role.

---

## 7. Permissão

`cln.module.access` — adicionada ao catálogo em
`app/core/permissions/catalog.py` e granted ao role `operator_base` no seed.
Aparece na lista de permissions pós-seed como total **37** (era 36).

Todas as rotas runtime do CLN usam `requires(permission="cln.module.access")`.
A exceção é o `/cln/config/effective` que usa `CurrentContextDep` direto —
não checa permissão explícita mas exige work-context válido.

---

## 8. Migrations aplicadas

| ID | Schema | O que faz |
|---|---|---|
| `t0014_cln_statuses` | tenant | Adiciona `cln_called`, `cln_attending`, `finished` ao CHECK constraint de `attendances.status`. |
| `0066_cln_config` | app | Adiciona colunas `cln_config` (JSONB) em `app.municipalities` e `app.facilities`. |

> Importante: a migration de statuses roda em **cada schema tenant**.
> Use `alembic -c alembic_tenant.ini -x tenant_schema=mun_{IBGE} upgrade head`.

---

## 9. Fluxo completo (E2E)

```
1. MASTER → /sys/municipios/{id}/modulos/cln/geral
   └─ enabled=true, triagemEnabled=true,
      triagemSectorName="Sala de Triagem",
      atendimentoSectorName="Sala de Medicação"

2. Recepção → atende paciente → encaminha pra "Sala de Triagem"
   └─ Attendance{ status: triagem_waiting, sector_name: "Sala de Triagem" }
   └─ attendance_events += forwarded

3. Sidebar do usuário mostra módulo "Clínica"
   └─ abre /cln/triagem

4. ClnQueuePage[triagem] lista o ticket na seção "Aguardando"
   └─ clique em "Chamar" → POST /cln/tickets/{id}/call
      └─ Attendance.status = cln_called
      └─ attendance_events += called
      └─ WS: painel:call pro painel da unidade

5. Clique em "Atender" → POST /cln/tickets/{id}/start
   └─ Attendance.status = cln_attending
   └─ attendance_events += started

6. Triagem termina → clique em "Liberar"
   └─ POST /cln/tickets/{id}/release
   └─ Attendance{ status: sector_waiting, sector_name: "Sala de Medicação" }
   └─ attendance_events += forwarded (triagem_completed)

7. Ticket aparece em /cln/atendimento, seção "Aguardando"
   └─ Chamar → Atender → Finalizar
   └─ Attendance.status = finished (terminal)
   └─ attendance_events += finished
```

---

## 10. Evoluções previstas (fora da Fase 1)

- **Encaminhamentos internos** (CLN → outro CLN, ou CLN → DGN/laboratório).
- **Formulário de triagem** com classificação de risco (ex.: Manchester) —
  prende dados clínicos ao evento `started`.
- **Dashboard**: tempo médio em cada fila, total por setor, exportação.
- **Multi-setor por unidade** (vários módulos CLN paralelos na mesma
  facility) — provavelmente via mudança no modelo de config pra array de
  setores em vez de `triagem_sector_name`/`atendimento_sector_name`
  singulares.
- **Fila priorizada por risco** (após triagem Manchester, ordena atendimento
  por cor da classificação).
