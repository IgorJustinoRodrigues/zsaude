# Cliente HTTP e módulos de API

## Cliente base

`src/api/client.ts` expõe um fetch fino com:

- **Base URL** de `VITE_API_URL` (default `http://localhost:8000`).
- **Authorization** automático via `tokenStore` (setado pelo `authStore` na boot).
- **X-Work-Context** opcional (`withContext: true`).
- **Auto-refresh** em 401: tenta `POST /auth/refresh` uma vez; se falhar, chama `onRefreshFailure()` (limpa storage e manda pro login).
- **Erros tipados** via `HttpError { code, message, status, errors }`.

### Atalhos

```ts
import { api } from '../api/client'

api.get<UserDetail>('/api/v1/users/me')
api.post<LoginOut>('/api/v1/auth/login', { login, password }, { anonymous: true })
api.patch<UserOut>('/api/v1/users/me', { phone: '...' })
api.put<void>('/api/v1/auth/password', { current, new: next })
api.delete<void>('/api/v1/tenants/facilities/{id}')
```

Opções disponíveis:

- `anonymous: true` — não manda `Authorization` (rotas de login/refresh).
- `withContext: true` — manda `X-Work-Context`. Use em tudo que é operacional (pacientes, atendimentos etc.).

## Módulos de API

Um arquivo por recurso do backend. Cada arquivo exporta tipos + funções que retornam dados já tipados.

```
src/api/
├── client.ts         # infra
├── auth.ts           # login, refresh, logout, me, passwords
├── users.ts          # CRUD usuários (admin)
├── workContext.ts    # options, select, current
├── sessions.ts       # presença + histórico
├── sys.ts            # municípios, unidades, settings (MASTER)
└── audit.ts          # listagem de audit logs
```

Exemplo (`src/api/users.ts`):

```ts
export async function list(params: { page?: number; pageSize?: number; q?: string }) {
  const qs = new URLSearchParams(...)
  return api.get<Paged<UserListItem>>(`/api/v1/users?${qs}`)
}

export async function get(userId: string) {
  return api.get<UserDetail>(`/api/v1/users/${userId}`)
}

export async function update(userId: string, patch: UserPatch) {
  return api.post<UserDetail>(`/api/v1/users/${userId}`, patch)
}
```

## Tratar erros

```ts
import { HttpError } from '../api/client'
import { toast } from '../store/toastStore'

try {
  await userApi.update(id, patch)
  toast.success('Usuário atualizado')
} catch (e) {
  if (e instanceof HttpError && e.status === 409) {
    toast.error('CPF já cadastrado')
  } else {
    toast.error('Falha ao salvar', (e as Error).message)
  }
}
```

`HttpError.errors` traz o array de erros de validação quando vem do Pydantic (`RequestValidationError`).

## camelCase no cliente

Backend retorna camelCase por padrão (via `alias_generator=to_camel` no `BaseSchema`). Você escreve as interfaces TS direto:

```ts
interface UserListItem { createdAt: string; municipalityCount: number }
```

Nada de conversão manual.

## Criar um módulo de API novo

1. Crie `src/api/<recurso>.ts`.
2. Defina tipos que espelhem os `schemas.py` do backend (camelCase).
3. Crie funções que chamem `api.get/post/patch/delete` com path certinho.
4. Consuma nas páginas via `useEffect` + `useState` (sem React Query por ora).

## Paginação

Backend retorna `Paged<T> = { items: T[], total: number, page: number, pageSize: number }`. Cliente só tipa e exibe.

## Presença (polling)

Em telas tipo TopBar/UserListPage:

```ts
useEffect(() => {
  let alive = true
  const load = () => sessionsApi.presence('actor').then(d => alive && setUsers(d))
  load()
  const t = setInterval(load, 15000)
  return () => { alive = false; clearInterval(t) }
}, [])
```

15s é o bastante — presença no backend já throttla em 30s.
