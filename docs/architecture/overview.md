# Arquitetura — visão geral

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind, Zustand, React Router |
| Backend | Python 3.13, FastAPI, SQLAlchemy async, asyncpg |
| Banco | PostgreSQL 17 (schemas, JSONB, `pg_trgm`) |
| Cache / presença | Valkey 8 (fork BSD do Redis) |
| Gerenciador Python | uv (Astral) |
| Migrations | Alembic (dois ambientes — `app` + tenant) |
| Auth | JWT RS256 + Argon2id + pepper HMAC |
| Dev mail | Mailpit (Mailhog drop-in) |

## Camadas do backend

```
router  →  service  →  repository  →  models
  (Pydantic)  (regra de negócio)  (SQLAlchemy)  (ORM)
```

- **router**: declara a rota, valida entrada/saída via Pydantic, injeta deps.
- **service**: regra de negócio, orquestra repos, chama `write_audit()` quando muta algo.
- **repository**: queries SQLAlchemy puras (nada de Pydantic).
- **models**: `Base` (compartilhado em `app`) ou `TenantBase` (tabela por município).

Imports cross-module passam por `service`, **nunca** por repository.

## Multi-tenancy

Um banco, vários schemas:

- **`app`** — identidade, diretório, auditoria, RBAC, configurações. É o schema compartilhado.
- **`mun_<ibge>`** — um por município (ex.: `mun_5208707` para Goiânia). Guarda tudo que é operacional: pacientes, atendimentos, exames...
- **`public`** — só `alembic_version` do ambiente app.

Cada request seta `search_path = "mun_<ibge>", "app", "public"` por transação, derivado do token de contexto (header `X-Work-Context`). Queries não qualificadas caem no schema do município primeiro; objetos de identidade ficam acessíveis via fallback no `app`.

Detalhes em [multi-tenant](../backend/multi-tenant.md).

## Níveis de usuário

- **MASTER** — plataforma (cria municípios, unidades, usuários globais, configs).
- **ADMIN** — município (gere usuários e unidades do seu município).
- **USER** — operacional (atende paciente, lança exame, fiscaliza...).

Detalhes em [security](../backend/security.md).

## Fluxo de autenticação

```
POST /auth/login           → accessToken (15min) + refreshToken (30d opaco)
GET  /work-context/options → árvore município/unidade/módulos do usuário
POST /work-context/select  → contextToken (header X-Work-Context) com mun/fac/role/mods
GET  /auth/me              → perfil
```

Access token traz `sub`, `ver` (revoga família se muda), `sid` (session id → presença).
Refresh rotaciona com detecção de replay: se alguém tenta reusar, a família inteira é morta.

## Auditoria e presença

- **Auditoria**: `AuditWriterMiddleware` capta mutações automaticamente; `write_audit()` registra eventos explícitos (login, troca de contexto, etc.). Escreve em `app.audit_logs`.
- **Presença**: cada request com `sid` no token faz `SessionService.touch()`, que atualiza `last_seen_at` em `app.user_sessions`. Throttled por 30s via Valkey.

Detalhes em [audit-and-sessions](../backend/audit-and-sessions.md).

## Monorepo

```
zsaude/
├── backend/        # FastAPI + Alembic + scripts
├── frontend/       # React + Vite
└── docs/           # (este diretório)
```

Backend e frontend são independentes (nada compartilhado por import). A ponte é o OpenAPI em `/openapi.json`.
