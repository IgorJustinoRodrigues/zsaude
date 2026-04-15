# Estrutura do frontend

```
frontend/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx               # entry, mount RouterProvider
    ├── App.tsx
    ├── api/                   # cliente HTTP + módulos de API
    ├── components/
    │   ├── layout/            # AppShell, SysShell, TopBar, Sidebar...
    │   ├── auth/              # RequireAuth, RequireContext, RequireModule, RequireMaster, RedirectIfAuthed
    │   ├── shared/
    │   └── ui/                # Button, Input, Modal, Toaster...
    ├── pages/
    │   ├── auth/              # LoginPage, SystemSelectPage, ContextSelectPage
    │   ├── sys/               # telas MASTER
    │   ├── cln/ dgn/ hsp/ pln/ fsc/ ops/
    │   ├── shared/            # UsersPage, NotificationsPage
    │   └── ForbiddenPage.tsx, NotFoundPage.tsx
    ├── router/
    │   └── index.tsx          # createBrowserRouter, árvore de rotas
    ├── store/                 # Zustand stores (globais)
    │   ├── authStore.ts       # access/refresh/context tokens + user
    │   ├── uiStore.ts         # currentSystem, municipality, facility
    │   ├── notificationStore.ts
    │   ├── queueStore.ts
    │   └── toastStore.ts      # toasts globais
    ├── types/
    ├── lib/
    └── mock/                  # dados fake (sumindo conforme API cobre mais)
```

## Stores (Zustand)

- **`authStore`**: tokens, user logado, métodos `login/logout/refresh`. Persiste em localStorage.
- **`uiStore`**: módulo corrente (`currentSystem`), município e unidade ativos, toggles de UI. Decide menu do AppShell.
- **`toastStore`**: fila de toasts. Helpers `toast.success/error/warning/info`.
- **`notificationStore`**, **`queueStore`**: bell de notificações e fila de pacientes (domínio).

## Módulos (pastas de `pages/`)

Seis módulos operacionais:

| Código | Nome |
|---|---|
| `cln` | Clínica (atendimento, prontuário) |
| `dgn` | Diagnóstico (laboratório, exames) |
| `hsp` | Hospitalar (AIH) |
| `pln` | Planos (convênios) |
| `fsc` | Fiscal (VISA) |
| `ops` | Operações (frota, relatórios, logs) |

Mais um contexto **SYS** (MASTER) em `pages/sys/` — painel de plataforma (municípios, unidades, usuários globais, configs, auditoria).

## Shells

- **`AppShell`** (`components/layout/AppShell.tsx`) — shell do usuário comum. Sidebar com o módulo corrente, TopBar com presença/notificações, breadcrumb, switcher de contexto.
- **`SysShell`** (`components/layout/SysShell.tsx`) — shell do MASTER. Menu fixo com Dashboard, Municípios, Unidades, Usuários, Auditoria, Config.

O router escolhe o shell baseado na rota:
- `/sys/*` → `SysShell` protegido por `RequireMaster`.
- Demais rotas autenticadas → `AppShell` protegido por `RequireAuth` + `RequireContext`.

## Roteamento

`src/router/index.tsx` usa `createBrowserRouter`. As rotas se encadeiam com guards:

```
RedirectIfAuthed
 └─ /login, /system, /context

RequireAuth
 └─ RequireContext
     └─ AppShell
         ├─ RequireModule(cln) → /cln/*
         ├─ RequireModule(dgn) → /dgn/*
         └─ ... (outros módulos)

RequireMaster
 └─ SysShell
     └─ /sys/*
```

Detalhes em [pages-and-guards](./pages-and-guards.md).

## Convenções

- **TSX puro**: sem CSS-in-JS. Tudo com Tailwind.
- **Tipos fortes**: sem `any` exceto em casos justificados. Prefira `unknown` + narrowing.
- **Stores por domínio**: nada de mega-store. Cada Zustand guarda uma preocupação.
- **API module per backend module**: `src/api/users.ts` fala só com `/api/v1/users`, etc.
- **Mocks saindo**: qualquer nova tela já consome API real. `src/mock/` é legado.
