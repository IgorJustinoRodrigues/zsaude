# Módulo Recepção (`rec`)

Módulo que abraça três funções habilitáveis independentemente por
município e unidade:

1. **Totem** — autoatendimento: paciente se identifica e retira uma senha.
2. **Balcão / Atendimento** — console da atendente: ver fila, chamar
   próxima senha, encaminhar.
3. **Painel de chamadas** — TV pública com senha atual + histórico +
   alerta sonoro.

Totem e painel rodam como **dispositivos pareados** (ver
[`devices.md`](./devices.md)): abrem URLs públicas, exibem um código
de pareamento, e um usuário autenticado na unidade os vincula.

---

## 1. Modelo & cascata de configuração

A config do módulo é guardada como JSONB em duas colunas:
`app.municipalities.rec_config` e `app.facilities.rec_config`. `NULL`
significa "herdar": unidade sem override usa o município; município sem
override usa os defaults do sistema.

```
┌────────────────────────┐
│ Defaults do sistema    │  totem, painel e atendimento habilitados
└────────────────────────┘
           ↓
┌────────────────────────┐
│ rec_config do município │  base para todas as unidades da cidade
└────────────────────────┘
           ↓
┌────────────────────────┐
│ rec_config da unidade   │  override — só pode restringir
└────────────────────────┘
```

A unidade **só consegue restringir** — se o município desliga o totem,
a unidade não pode religá-lo. Isso é enforçado em duas camadas:

- Backend (`app/modules/rec/service.py::_assert_within_parent`) retorna
  `409` ao salvar um override que viola a cascata.
- Frontend (`pages/sys/SysRecConfigPage.tsx`) tranca os campos
  correspondentes na UI — banner amarelo + `disabled` nos toggles — pra
  evitar que o usuário tente e falhe.

### Schema da config

```ts
{
  totem: {
    enabled: boolean,
    capture: { cpf, cns, face, manualName },  // formas de identificação
    priorityPrompt: boolean,                   // pergunta "você tem prioridade?"
  },
  painel: {
    enabled: boolean,
    mode: 'senha' | 'nome' | 'ambos',
    announceAudio: boolean,                    // voz sintetizada
  },
  recepcao: {
    enabled: boolean,
    afterAttendance: 'triagem' | 'consulta' | 'nenhum',
  },
}
```

Defaults em `app/modules/rec/service.py::default_rec_config`.

---

## 2. Endpoints

### Admin (MASTER)

| Método | Path | Efeito |
|---|---|---|
| `GET`    | `/api/v1/admin/rec/config/municipalities/{id}` | Config crua do município (sem merge). |
| `PATCH`  | `/api/v1/admin/rec/config/municipalities/{id}` | Merge parcial — enviar `{config: {totem: {...}}}` atualiza só aquela seção. `{config: null}` limpa tudo. |
| `DELETE` | `/api/v1/admin/rec/config/municipalities/{id}/{section}` | Limpa uma seção específica. |
| `GET`    | `/api/v1/admin/rec/config/facilities/{id}` | Config crua da unidade. |
| `PATCH`  | `/api/v1/admin/rec/config/facilities/{id}` | Merge parcial. `409` se violar a cascata. |
| `DELETE` | `/api/v1/admin/rec/config/facilities/{id}/{section}` | Volta a seção a herdar do município. |

### Runtime (qualquer usuário autenticado)

| Método | Path | Efeito |
|---|---|---|
| `GET` | `/api/v1/rec/config/effective` | Config efetiva (defaults → município → unidade). Aceita `?facilityId=` ou `?municipalityId=`; sem parâmetros usa o work-context. |
| `POST` | `/api/v1/rec/calls` | Dispara uma chamada no painel. Publica o evento `painel:call` no canal Valkey da unidade (ver [devices.md](./devices.md)). |

---

## 3. Páginas MASTER — personalizar módulos

Hierarquia em 3 telas, pensada pra ser genérica (outros módulos no
futuro usam o mesmo shell):

```
/sys/municipios/:id/modulos                 → tela 1: lista de módulos
/sys/municipios/:id/modulos/:module         → tela 2: seções do módulo
/sys/municipios/:id/modulos/:module/:sect   → tela 3: form focado
```

Mesma estrutura para `/sys/unidades/:id/...`.

### Tela 1 — `SysMunicipalityModulesPage` / `SysFacilityModulesPage`

Cards dos módulos com config implementada. O registro mora em
`MODULES_WITH_CONFIG` em `pages/sys/SysModulesConfigPages.tsx`.

### Tela 2 — `SysMunicipalityModuleSectionsPage` / `SysFacilityModuleSectionsPage`

Cards das seções do módulo selecionado (para `rec`: Totem, Painel,
Atendimento). Cada card mostra badge **"Personalizado"** se o escopo
tem override salvo pra aquela seção.

### Tela 3 — `SysMunicipalityRecSectionPage` / `SysFacilityRecSectionPage`

Form focado da seção. UX-chave:

- Abre editável, pré-preenchido com o valor **efetivo** atual (sem
  "começar a personalizar").
- Badge de status: **Personalizado** / **Herdado** / **Padrão do sistema**.
- Botão **"Voltar a herdar"** (facility) / **"Usar padrão"** (município)
  só aparece quando há override — chama `DELETE .../{section}`.
- Toggle mestre (`MasterToggle`) da seção em container destacado para
  deixar claro que desliga a feature inteira, não um campo isolado.
- Quando em escopo facility e o município restringiu: banner âmbar +
  controles trancados com tag "bloqueado".

### Entrada

Na listagem (`SysMunicipalityListPage` / `SysFacilityListPage`): botão
**"Módulos"** (ícone de engrenagem) ao lado do "Personalizar" (identidade).

---

## 4. Páginas de uso — consumindo a config no runtime

Hook **`useEffectiveRecConfig`** (`hooks/useEffectiveRecConfig.ts`)
carrega a config efetiva do work-context ativo e é a fonte única de
verdade para esconder/desabilitar features no frontend.

**Usos atuais:**

| Local | Comportamento |
|---|---|
| `components/layout/Sidebar.tsx` | `filterRecNav()` esconde itens do módulo `rec` cujas features estão desativadas. Seções do menu que ficam vazias também somem. |
| `pages/rec/RecHomePage.tsx` | Filtra os cards de atalho (Fila, Totem, Painel) com base em `config.{feature}.enabled`. |
| `components/auth/RequireRecFeature.tsx` | Guard de rota: redireciona pra `/rec` se a feature da rota está desativada. Usado em `/rec/atendimento`, `/rec/totem`, `/rec/painel`. |

Adicionar uma nova feature desativável é basicamente: incluí-la no
schema, registrar no `MODULE_NAV.rec` do Sidebar mapeando pra um path,
garantir que o guard de rota tenha o `feature` correto e (se fizer
sentido) um card no dashboard.

---

## 5. Páginas do módulo (área autenticada)

| Path | Arquivo | Descrição |
|---|---|---|
| `/rec` | `RecHomePage` | Dashboard com métricas e atalhos. |
| `/rec/atendimento` | `RecQueuePage` | Console da atendente: fila + chamar próximo + ações (registrar chegada, buscar paciente). Publica `painel:call` ao chamar uma senha. |
| `/rec/totem` | `RecTotemPage` | Preview do totem dentro do app (devem-se usar as URLs públicas em devices reais). |
| `/rec/painel` | `RecPainelPage` | Preview do painel; lê do `liveCallStore`. |
| `/rec/dispositivos` | `RecDevicesPage` | Listar/parear/revogar totens e painéis da unidade atual. |

---

## 6. Permissões e módulos habilitados

- A permissão `rec.module.access` controla quem vê o módulo no seletor
  de sistemas (`/selecionar-sistema`). Hoje ainda **não está atribuída
  a nenhum role-base** — atribuir via UI MASTER (`/sys/perfis`) ou pelo
  seed (`app/core/permissions/seed.py`) conforme o público que deve ter
  acesso.
- O módulo `rec` está em `OPERATIONAL_MODULES` (backend) e é
  automaticamente incluído em `Municipality.enabled_modules = NULL`
  (default = todos).

---

## 7. Migrations

| Revision | Efeito |
|---|---|
| `0052_rename_cha_to_rec` | Renomeia `"cha"` → `"rec"` em `enabled_modules` (municípios e unidades). |
| `0053_rec_config` | Adiciona colunas JSONB `rec_config` em `municipalities` e `facilities`. |
| `0054_devices` | Tabela `devices` (ver [`devices.md`](./devices.md)). |
