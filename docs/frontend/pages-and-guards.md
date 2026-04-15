# Páginas, rotas e guards

## Guards disponíveis

Em `src/components/auth/`:

| Guard | Checa | Redireciona para |
|---|---|---|
| `RedirectIfAuthed` | se já logado, bloqueia /login | `/system` |
| `RequireAuth` | tem access token? | `/login` |
| `RequireContext` | tem `X-Work-Context` ativo? | `/context` |
| `RequireModule` | módulo da URL está no contexto? | `/forbidden` |
| `RequireMaster` | user é MASTER? | `/forbidden` |

Todos são `Outlet`-based (wrappers). Componha aninhando no router.

## Estrutura do router

`src/router/index.tsx`:

```tsx
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },

  // Rotas públicas
  { element: <RedirectIfAuthed />, children: [
    { path: '/login', element: <LoginPage /> },
  ]},

  // Rotas de pré-contexto (autenticado, sem módulo ativo)
  { element: <RequireAuth />, children: [
    { path: '/system', element: <SystemSelectPage /> },
    { path: '/context', element: <ContextSelectPage /> },
  ]},

  // App do usuário comum
  { element: <RequireAuth />, children: [
    { element: <RequireContext />, children: [
      { element: <AppShell />, children: [
        // Módulo CLN
        { element: <RequireModule module="cln" />, children: [
          { path: '/cln', element: <GAHomePage /> },
          { path: '/cln/patients', element: <PatientListPage /> },
          // ...
        ]},
        // ... outros módulos
        // Compartilhado (qualquer módulo ativo)
        { path: '/shared/users', element: <UsersPage /> },
      ]},
    ]},
  ]},

  // Painel MASTER
  { element: <RequireMaster />, children: [
    { element: <SysShell />, children: [
      { path: '/sys/dashboard', element: <SysDashboardPage /> },
      // ...
    ]},
  ]},

  { path: '/forbidden', element: <ForbiddenPage /> },
  { path: '*', element: <NotFoundPage /> },
])
```

## Criar uma página nova

### 1. Componente

`src/pages/cln/NewExamPage.tsx`:

```tsx
import { useState } from 'react'
import { toast } from '../../store/toastStore'
import { examsApi } from '../../api/exams'

export function NewExamPage() {
  const [saving, setSaving] = useState(false)
  async function submit(data: ExamIn) {
    setSaving(true)
    try {
      await examsApi.create(data)
      toast.success('Exame solicitado')
    } catch {
      toast.error('Falha ao solicitar exame')
    } finally { setSaving(false) }
  }
  return <form onSubmit={...}>...</form>
}
```

### 2. Rota

Em `src/router/index.tsx`, dentro do bloco `RequireModule module="cln"`:

```tsx
{ path: '/cln/exams/new', element: <NewExamPage /> },
```

### 3. Menu / sidebar

Se a página deve aparecer no menu do módulo, adicione o item no componente de sidebar correspondente. O `AppShell` monta o menu baseado em `uiStore.currentSystem`.

## Proteger ações dentro da página

O guard de rota garante acesso à tela. Para botões sensíveis (ex.: "apagar paciente"), confira o `user.level` do `authStore`:

```tsx
const user = useAuthStore(s => s.user)
{user?.level === 'master' && <Button onClick={destroy}>Apagar</Button>}
```

Mas lembre: o backend também valida (`MasterDep`). Esconder é UX; autorizar é no servidor.

## Fluxo de contexto

1. `/login` — user+senha → armazena tokens.
2. `/system` — escolhe módulo (CLN, DGN, HSP...). Se MASTER, pula para `/sys/dashboard`.
3. `/context` — escolhe município + unidade. Chama `POST /work-context/select` e guarda o token retornado.
4. `/<modulo>` — home do módulo.

Ao trocar de módulo/unidade, o usuário passa pelo `ContextSelectPage` de novo. A última escolha fica em localStorage (via `uiStore`), então após F5 ele volta direto para onde parou.

## Navegação programática

```tsx
import { useNavigate } from 'react-router-dom'
const nav = useNavigate()
nav('/cln/patients', { replace: true })
```

Respeite os guards: mandar `/sys/dashboard` sem ser MASTER cai em `/forbidden`.
