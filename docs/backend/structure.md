# Estrutura do backend

```
backend/
├── alembic.ini                  # app migrations (schema `app`)
├── alembic_tenant.ini           # tenant migrations (schema `mun_<ibge>`)
├── docker-compose.yml           # postgres, valkey, mailpit, app
├── docker-compose.override.yml  # hot-reload em dev
├── Dockerfile                   # multi-stage com uv
├── pyproject.toml               # deps + ruff + pyright
│
├── migrations/versions/         # migrations do schema `app`
├── migrations_tenant/versions/  # migrations aplicadas em cada mun_<ibge>
│
├── scripts/
│   ├── seed.py                  # popula municípios, unidades, users
│   ├── migrate_tenants.py       # aplica tenant migrations em todos/um município
│   ├── generate_jwt_keys.py     # gera par RSA para JWT
│   └── create_superuser.py
│
└── app/
    ├── main.py                  # factory FastAPI, middlewares, lifespan
    ├── api/
    │   ├── v1.py                # agregador (include_router por módulo)
    │   └── health.py            # /health
    ├── core/
    │   ├── config.py            # Settings (pydantic-settings)
    │   ├── deps.py              # get_db, current_user, current_context, requires
    │   ├── security.py          # hash/verify Argon2 + JWT encode/decode
    │   ├── audit.py             # AuditContext, write_audit
    │   ├── exceptions.py        # AppError + handlers
    │   ├── logging.py           # structlog
    │   ├── pagination.py, schema_base.py, validators.py
    ├── db/
    │   ├── base.py              # Base (schema="app")
    │   ├── session.py           # engine async + sessionmaker
    │   ├── tenant_schemas.py    # ensure/drop schema + apply_tenant_migrations
    │   ├── models_registry.py   # importa todos os models de `app`
    │   └── types.py             # UUID7, etc.
    ├── middleware/
    │   ├── request_id.py
    │   ├── security_headers.py
    │   ├── audit_context.py     # ip, user-agent em contextvars
    │   └── audit_writer.py      # grava audit_logs em mutações
    ├── modules/
    │   ├── auth/                # login, refresh, me, passwords
    │   ├── users/               # CRUD de usuários
    │   ├── tenants/             # municípios + unidades + work-context
    │   ├── sessions/            # presença, histórico de sessões
    │   ├── audit/               # leitura dos logs
    │   ├── system/              # config global (MASTER)
    │   └── permissions/         # roles/permissions (stub RBAC)
    └── tenant_models/
        ├── __init__.py          # TenantBase (metadata SEM schema)
        ├── _registry.py         # importa modelos tenant
        └── patients.py          # primeiro modelo per-município
```

## Convenções por módulo

Cada módulo segue:

```
modules/<nome>/
├── router.py       # rotas (FastAPI APIRouter)
├── schemas.py      # Pydantic (entrada e saída, camelCase via alias_generator)
├── service.py      # regra de negócio
├── repository.py   # queries SQLAlchemy
└── models.py       # ORM (herda de Base — schema `app`)
```

Modelos que vivem em **schemas de município** (pacientes, atendimentos, exames...) ficam fora de `modules/`, em `app/tenant_models/` com `TenantBase`.

## Regras de camada

- `router → service → repository → models`. Nunca pule etapas.
- Repositories retornam ORM. Services convertem para Pydantic/Dict no caminho de saída.
- Imports cross-module passam por **services**, nunca por repositories ou models.
- `schemas.py` só é importado por `router.py` e `service.py`.

## Pydantic

- `alias_generator=to_camel`, `populate_by_name=True` na base. Backend usa snake_case, JSON sai camelCase.
- `extra="forbid"` em todos os inputs (rejeita campos extras silenciosos).
- Veja `app/core/schema_base.py` para o `BaseSchema` padrão.

## Aliases úteis

Definidos em `app/core/deps.py`:

- `DB = Annotated[AsyncSession, Depends(get_db)]`
- `Valkey = Annotated[redis.Redis, Depends(get_valkey)]`
- `CurrentUserDep`, `CurrentContextDep` — autenticação
- `MasterDep`, `AdminOrMasterDep` — guards de nível
- `requires(module="cln")` — guard por módulo do contexto

Use nas assinaturas do router:

```python
@router.get("/me")
async def me(user: CurrentUserDep, db: DB) -> UserOut: ...
```
