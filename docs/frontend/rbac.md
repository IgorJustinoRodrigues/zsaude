# RBAC no frontend

Como consumir o sistema de permissões nas telas.

## O que está disponível depois do login

Quando o usuário seleciona o contexto de trabalho (`POST /work-context/select`),
o backend resolve as permissões e devolve como parte do `WorkContext`:

```ts
context: {
  municipality: Municipality
  facility: Facility
  role: string          // nome do perfil do acesso
  modules: SystemId[]   // derivado das permissões (cln, dgn, ...)
  permissions: string[] // lista de perm codes resolvidos; ['*'] para MASTER
}
```

Fica persistido em `authStore` e disponível em qualquer componente.

## Helper `can(code)`

Em `src/store/authStore.ts`:

```ts
const can = useAuthStore(s => s.can)

if (can('cln.patient.edit')) { ... }
```

- Retorna `false` se não tem contexto ativo.
- Retorna `true` sempre se `permissions` contém `*` (MASTER).
- Caso contrário, checa presença na lista.

## Padrões de uso

### 1. Esconder ações sensíveis

```tsx
const can = useAuthStore(s => s.can)

return (
  <PageHeader
    title="Pacientes"
    actions={
      can('cln.patient.create') && (
        <button onClick={openCreate}>Novo paciente</button>
      )
    }
  />
)
```

A ação só renderiza se o usuário pode executar. O backend também valida
(via `requires()`), então esconder é **apenas UX**.

### 2. Condicionar rotas

`RequireModule` já filtra: só deixa entrar em `/cln` se o usuário tem
alguma permissão em `cln.*`. Pra proteções mais finas:

```tsx
const can = useAuthStore(s => s.can)
if (!can('ops.report.export')) return <Navigate to="/403" replace />
```

### 3. Lidar com 403 do backend

Se a UI esquecer de esconder, o backend retorna `403`:

```tsx
try {
  await dgnApi.requestExam()
} catch (e) {
  if (e instanceof HttpError && e.status === 403) {
    toast.error('Sem permissão', 'Você não pode solicitar exames.')
    return
  }
  throw e
}
```

## Menu lateral

O `AppShell` monta o sidebar do módulo ativo (`currentSystem`). O switcher
de módulos no TopBar mostra apenas os módulos onde o usuário tem
**alguma** permissão (derivados de `ctx.modules`).

Pra gatear **itens dentro** de um módulo (ex.: esconder "Agenda" de quem
só lê paciente), envolva em `can()`:

```tsx
{can('cln.appointment.view') && (
  <NavItem to="/cln/agendamentos" label="Agendamentos" />
)}
```

## API clients

Dois módulos HTTP em `src/api/roles.ts`:

- `rolesApi` — contexto município (com `X-Work-Context`). Quem chama tem
  que ter `roles.role.*` resolvido.
- `rolesAdminApi` — MASTER sem contexto. Gestão global.

Principais métodos:

```ts
// Listar perfis disponíveis no município atual
const roles = await rolesApi.list()

// Detalhe com matriz efetiva (grant/deny/inherit por permissão)
const detail = await rolesApi.get(roleId)

// Criar role MUNICIPALITY herdando de SYSTEM
await rolesApi.create({
  code: 'recep_gineco',
  name: 'Recepção Ginecologia',
  parentId: receptionistBaseId,
})

// Aplicar matriz de permissões
await rolesApi.setPermissions(roleId, {
  permissions: [
    { code: 'cln.appointment.cancel', state: 'deny' },
    { code: 'cln.appointment.edit',   state: 'inherit' },
  ],
})

// Override por acesso específico
await rolesApi.setAccessPermissions(userId, accessId, {
  permissions: [{ code: 'cln.patient.view', state: 'deny' }],
})
```

MASTER usa `rolesAdminApi` com a mesma API, passando `municipalityId`
opcional pra filtrar.

## Componente `<PermissionMatrix>`

Reutilizado em 3 telas (SYS roles, shared roles, access overrides):

```tsx
import { PermissionMatrix } from '../../components/shared/PermissionMatrix'

<PermissionMatrix
  entries={role.permissions}     // vem do backend
  editable={isEditing}           // bool
  onChange={(code, state) => {   // 'grant' | 'deny' | 'inherit'
    setDraft(prev => ({ ...prev, [code]: state }))
  }}
/>
```

Estrutura visual:

- **Tabs** por módulo (cln, dgn, ...).
- **Grupos** por recurso (patient, appointment, ...).
- **Linhas** por ação com tri-state (✓ grant / ✗ deny / — inherit).
- Badge "customizado" no grupo quando há override vs herdado.
- Etiqueta "herdado: concedido/negado" ao lado.

## Telas prontas

| Rota | Quem | Pra quê |
|---|---|---|
| `/sys/perfis` | MASTER | Listar SYSTEM + MUNICIPALITY globalmente |
| `/sys/perfis/novo` | MASTER | Criar SYSTEM ou MUNICIPALITY |
| `/sys/perfis/:id` | MASTER | Editar matriz de qualquer perfil |
| `/shared/perfis` | ADMIN com `roles.role.view` | Listar perfis do município atual |
| `/shared/perfis/novo` | ADMIN com `roles.role.create` | Criar perfil local |
| `/shared/perfis/:id` | ADMIN com `roles.role.view` | Ver/editar (só MUN editável) |
| `/ops/usuarios/:userId/acessos/:accessId/permissoes` | `roles.override.manage` | Override por acesso |

## Receita para um recurso novo no frontend

Exemplo: adicionar botão "Nova solicitação" no módulo DGN.

### 1. API client

`src/api/dgn.ts`:

```ts
export const dgnApi = {
  listExams: () =>
    api.get<ExamItem[]>('/api/v1/dgn/exams', { withContext: true }),
  requestExam: () =>
    api.post<ExamItem>('/api/v1/dgn/exams', undefined, { withContext: true }),
}
```

### 2. Página com ação condicional

```tsx
export function DgnHomePage() {
  const can = useAuthStore(s => s.can)
  const [exams, setExams] = useState<ExamItem[]>([])

  useEffect(() => {
    dgnApi.listExams().then(setExams)
  }, [])

  const handleRequest = async () => {
    const created = await dgnApi.requestExam()
    setExams(e => [created, ...e])
    toast.success('Exame solicitado')
  }

  return (
    <PageHeader
      title="Diagnóstico"
      actions={
        can('dgn.exam.request') && (
          <button onClick={handleRequest}>Nova solicitação</button>
        )
      }
    />
  )
}
```

### 3. Rota

`src/router/index.tsx`:

```tsx
{
  element: <RequireModule moduleId="dgn" />,
  children: [
    { path: '/dgn', element: <DgnHomePage /> },
  ],
},
```

`RequireModule` garante que o user tem alguma permissão em `dgn.*`.
Se não tem, cai em `/403`.

### 4. Testar com personas diferentes

1. Logar como MASTER → vê tudo.
2. Logar como usuário com `dgn.exam.view` + `dgn.exam.request` → vê botão.
3. Logar como usuário só com `dgn.exam.view` → vê lista, **sem** botão.
4. Logar como usuário sem nenhuma `dgn.*` → módulo não aparece no switcher.

## Invalidação e frescor

O frontend **não cacheia** permissões — cada vez que o contexto é
selecionado, as permissões atuais vêm do backend. Após o ADMIN mudar um
perfil, o próximo `select` do usuário afetado (ou próximo request com
`X-Work-Context`, que revalida) reflete a mudança.

Para forçar atualização no navegador sem logout:

```ts
// Re-seleciona o mesmo contexto
const { selectContext, context } = useAuthStore.getState()
if (context) {
  await selectContext(context.municipality.id, context.facility.id)
}
```

Útil quando o usuário acabou de ajustar o próprio acesso via UI.

## Debug

- Browser DevTools → Application → Local Storage → `zsaude-auth` mostra
  `context.permissions`.
- Rede: `/work-context/current` devolve o estado resolvido.
- No React: `useAuthStore.getState().context` no console.

## Veja também

- [Backend RBAC](../backend/rbac.md) — modelo + endpoints + resolução.
- [Páginas e guards](./pages-and-guards.md).
- [Toasts](./toasts.md).
