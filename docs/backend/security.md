# Segurança

## Níveis de usuário

Enum `UserLevel` em `app.users.level`:

| Nível | Escopo | Pode |
|---|---|---|
| **MASTER** | Plataforma | criar/editar/arquivar municípios, criar unidades em qualquer município, criar/editar qualquer usuário (incl. outros MASTER), ver auditoria global, alterar configs globais |
| **ADMIN** | Município | gerenciar usuários e unidades do seu município; ver auditoria local |
| **USER** | Operacional | acessar os módulos (CLN/DGN/HSP/PLN/FSC/OPS) conforme permissões da unidade |

Regra: só MASTER cria outro MASTER. Na tela de cadastro de usuário, o campo "nível" só mostra MASTER se o usuário atual for MASTER.

## Autenticação

### Senha

- Hash **Argon2id** (`argon2-cffi`) com `time_cost=3, memory_cost=64MiB, parallelism=4`.
- **Pepper** HMAC-SHA256 do env aplicada antes do hash. Sem o pepper, hashes vazados não se verificam.

### JWT

- **Algoritmo**: RS256 (par de chaves em `backend/secrets/`). Gere com `uv run python -m scripts.generate_jwt_keys`.
- **Access token** (15 min): claims `sub` (user_id), `ver` (token_version), `sid` (session_id), `typ=access`.
- **Refresh token** (30 dias): opaco (string aleatória), guardado **hasheado** em `app.refresh_tokens`. `family_id` rastreia a cadeia.
- **Context token** (configurável): claims `sub`, `mun`, `ibge`, `fac`, `role`, `mods`, `typ=context`. Vai no header `X-Work-Context`.

### Rotação de refresh

Cada refresh válido devolve um novo par e marca o antigo como usado. Se alguém tenta reusar um antigo, a família inteira é revogada (detecção de replay).

### Revogação

- Troca de senha → `users.token_version += 1` → todos access tokens antigos caem na próxima validação (`current_user`).
- Logout → revoga a família de refresh e encerra a sessão.
- Admin "bloquear usuário" → `is_active = false` + bump de `token_version`.

## Rate limit

`slowapi` com backend em memória (dev) / Valkey (prod):

| Rota | Limite |
|---|---|
| `POST /auth/login` | 5/min/IP |
| `POST /auth/forgot-password` | 3/hora/email |
| `POST /auth/refresh` | 20/min/IP |

## CORS e headers

- `CORSMiddleware` com whitelist do `.env` (`CORS_ORIGINS`). Nunca wildcard.
- `SecurityHeadersMiddleware` seta: HSTS (prod), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` mínimo.

## Input validation

- Pydantic v2 com `extra="forbid"` (rejeita campos extras).
- Validadores CPF, CNS, CNPJ, CEP em `app/core/validators.py`.
- IDs sempre UUID — strings do frontend são validadas pela tipagem do Pydantic.

## Contexto por transação (search_path)

O listener SQL em `app/db/session.py` emite `SET LOCAL search_path = ...` no começo de cada transação, derivado do `X-Work-Context`. Consequência de segurança: **não dá** para uma request "vazar" entre municípios por esquecer um `WHERE municipality_id = ...` — as queries só enxergam o schema do seu contexto.

Endpoints MASTER que precisam operar cross-tenant usam `MasterDep` sem `CurrentContextDep` — o search_path vira só `"app", "public"`.

## Guards de rota

Em `app/core/deps.py`:

- `CurrentUserDep` — exige access token válido.
- `CurrentContextDep` — exige `X-Work-Context` válido; popula `WorkContext` com município/unidade/role/módulos.
- `MasterDep` — exige `level=MASTER`.
- `AdminOrMasterDep` — exige `ADMIN` ou `MASTER`.
- `requires(module="cln")` — exige que o contexto tenha o módulo.

Use sempre o mais específico:

```python
@router.delete("/municipalities/{id}")
async def archive(id: UUID, user: MasterDep, db: DB): ...
```

## Frontend

- `RequireAuth` — precisa ter access token.
- `RequireContext` — precisa ter contexto selecionado.
- `RequireModule` — precisa ter o módulo no contexto atual.
- `RequireMaster` — precisa ser MASTER.
- `RedirectIfAuthed` — se logado, não deixa voltar para /login.

## Segredos

- `backend/.env` — **nunca** commitado. `backend/.env.example` sim.
- Chaves JWT em `backend/secrets/` — também no `.gitignore`.
- Pepper da senha no `.env` como `PASSWORD_PEPPER`.

## Auditoria como controle

Tudo que afeta autenticação, permissão ou dados sensíveis passa por `write_audit(...)`. Um ataque de credencial quebrada deixa rastro em `action="login_fail"`. Veja [audit-and-sessions](./audit-and-sessions.md).
