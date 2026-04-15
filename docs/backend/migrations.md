# Migrations

Dois ambientes Alembic convivem:

| Ambiente | Config | Pasta | Aplica em |
|---|---|---|---|
| **app** (compartilhado) | `alembic.ini` | `migrations/versions/` | schema `app` |
| **tenant** (por município) | `alembic_tenant.ini` | `migrations_tenant/versions/` | cada `mun_<ibge>` |

Eles usam metadata declarativa separada (`Base` vs `TenantBase`) — o autogenerate de um **não** enxerga tabelas do outro.

## Todos os comandos rodam dentro do container

```bash
cd backend
docker compose exec app <comando>
```

## Migrations do schema `app`

### Aplicar

```bash
docker compose exec app alembic upgrade head
```

### Criar nova

1. Edite/crie o modelo em `app/modules/<nome>/models.py` (herda de `Base`).
2. Registre no `app/db/models_registry.py` se for um módulo novo.
3. Autogenerate:

```bash
docker compose exec app alembic revision --autogenerate -m "add foo table"
```

4. Revise o arquivo em `migrations/versions/<id>_add_foo_table.py`.
5. Aplique: `docker compose exec app alembic upgrade head`.

### Voltar uma versão

```bash
docker compose exec app alembic downgrade -1
```

## Migrations de município (tenant)

Cada schema `mun_<ibge>` tem sua própria tabela `alembic_version`. O env resolve o schema-alvo via variável de ambiente ou `-x`:

```bash
# via env var
docker compose exec -e ALEMBIC_TENANT_SCHEMA=mun_5208707 app \
  alembic -c alembic_tenant.ini upgrade head

# via -x
docker compose exec app \
  alembic -c alembic_tenant.ini -x tenant_schema=mun_5208707 upgrade head
```

### Aplicar em todos os municípios de uma vez

```bash
# Todos os ativos
docker compose exec app python -m scripts.migrate_tenants

# Um específico
docker compose exec app python -m scripts.migrate_tenants --ibge 5208707

# Inclui arquivados
docker compose exec app python -m scripts.migrate_tenants --all
```

Este script é o **jeito canônico** de rodar tenant migrations em lote após um deploy que adiciona/altera tabelas per-município.

### Criar nova migration tenant

Alembic autogenerate precisa de uma conexão apontando para um schema existente com a versão atual.

1. Edite/crie o modelo em `app/tenant_models/<arquivo>.py` (herda de `TenantBase`).
2. Registre em `app/tenant_models/_registry.py`.
3. Autogenerate (use um schema existente, ex.: `mun_5208707`):

```bash
docker compose exec -e ALEMBIC_TENANT_SCHEMA=mun_5208707 app \
  alembic -c alembic_tenant.ini revision --autogenerate -m "add foo table"
```

4. Revise o arquivo em `migrations_tenant/versions/<id>_add_foo_table.py`.
   - **Nunca** inclua `schema=` em `op.create_table`. O `search_path` já resolve.
5. Aplique em todos os municípios:

```bash
docker compose exec app python -m scripts.migrate_tenants
```

## Resetar tudo (dev)

Zera Postgres, aplica migrations novamente, popula seed:

```bash
docker compose down -v                               # -v apaga volume
docker compose up -d
docker compose exec app alembic upgrade head
docker compose exec app python -m scripts.seed      # provisiona schemas + tenant migrations
```

## Como o env.py do tenant funciona

`migrations_tenant/env.py` abre a conexão com `search_path` já no schema-alvo via `server_settings`:

```python
connectable = async_engine_from_config(
    ...,
    connect_args={
        "server_settings": {"search_path": f'"{schema}", "app", "public"'},
    },
)
```

E configura o Alembic com `version_table_schema=schema` para cada município rastrear suas próprias revisões.

Detalhe crítico: o env faz `CREATE SCHEMA IF NOT EXISTS` e `connection.commit()` **antes** do `context.run_migrations()`, garantindo que o schema exista mesmo na primeira aplicação.

## Troubleshooting

- **"relation mun_X.alembic_version does not exist"** — schema existe mas nunca recebeu migration. Rode `python -m scripts.migrate_tenants --ibge X`.
- **Autogenerate gerou tabela duplicada no schema errado** — esqueceu de commitar a migration tenant e deixou o modelo encostar em `Base`. Confirme herança de `TenantBase`.
- **Tenant migration tenta criar schema já preenchido** — provavelmente rodou `alembic upgrade head` no ambiente errado (app) com o modelo tenant sendo enxergado. Verifique `include_schemas` e o `target_metadata` usado pelo env.
