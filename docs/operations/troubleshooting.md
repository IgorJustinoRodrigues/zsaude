# Troubleshooting

Problemas comuns e como resolver.

## Backend não sobe

**Sintoma**: `docker compose up` falha.

- `docker compose logs app` — ver stacktrace.
- **Porta 5433 ocupada** → mude em `docker-compose.yml` ou pare o serviço que usa.
- **.env faltando** → `cp .env.example .env`.
- **Chaves JWT ausentes** → `docker compose exec app python -m scripts.generate_jwt_keys`.

## `/health` retorna db: error

- Postgres ainda inicializando — aguarde 10s (healthcheck leva um tempo).
- `docker compose logs postgres` — ver se tem corrupção de volume. Fix bruto: `docker compose down -v && docker compose up -d` (perde os dados).

## Login retorna 401 mas a senha está certa

- Seed foi rodado? `docker compose exec app python -m scripts.seed`.
- `token_version` desincronizado após troca de senha — tokens antigos são invalidados. Logar de novo.
- `is_active=false` ou `status=Bloqueado` → desbloqueie pelo MASTER.

## "Contexto expirado. Selecione novamente."

Context token tem TTL. Basta refazer `POST /work-context/select` — o frontend já redireciona para `/context`.

## Frontend não atualiza após mudança no backend

- Vite cacheia tipos. Rode `npm run dev` de novo se mexeu em `.env`.
- Se estiver usando OpenAPI types gerados, regere: `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`.

## "relation mun_XXXX.alembic_version does not exist"

Schema existe mas nunca teve tenant migration aplicada. Rode:

```bash
docker compose exec app python -m scripts.migrate_tenants --ibge XXXXXXX
```

## Autogenerate tenant cria coisas que não deveria

- O modelo novo precisa herdar de `TenantBase`, **não** de `Base`.
- O registry `app/tenant_models/_registry.py` precisa importar o modelo.
- Se o autogenerate inclui tabelas do schema `app`, seu `ALEMBIC_TENANT_SCHEMA` provavelmente está errado ou o modelo tenant está herdando de `Base`.

## Migration tenta criar em schema errado

- Confira que `op.create_table(...)` **não** tem `schema=`. O `search_path` já resolve.
- Confira `version_table_schema` em `migrations_tenant/env.py` — deve usar o `_resolve_schema()`.

## Usuário não aparece em /users/presence

- Sessão nunca foi tocada (token gerado antes da feature de sessões existir). Faça logout + login.
- `last_seen_at` > 2min → é considerado offline. Filtro padrão é "recente".

## Seed duplicou algo?

Não deveria — seed é idempotente (usa `uuid5(NAMESPACE, 'usr1')` para IDs determinísticos). Se duplicou, provavelmente rodou em banco novo com registros manuais pré-existentes com IDs diferentes.

## Uvicorn não faz hot reload

- Confira `docker-compose.override.yml` — volumes `./app:/app/app`, `./migrations:/app/migrations` etc. devem estar mapeados.
- O uvicorn só recarrega em mudanças dentro de `--reload-dir /app/app`. Se você editou em `migrations/`, não recarrega (e nem precisa).

## Frontend pedindo login em loop

- Tokens no localStorage corrompidos. Abra DevTools → Application → Local Storage → delete tudo de `zsaude-*`.
- `/auth/refresh` retornando erro e `onRefreshFailure` disparando. Veja logs do backend.

## CORS bloqueando chamadas

- `.env` do backend precisa ter a origem do frontend em `CORS_ORIGINS` (ex.: `http://localhost:5173`).
- Depois de alterar, `docker compose restart app`.

## "search_path não aplicado" — queries vazias

- O `current_context` não foi resolvido → não tem `X-Work-Context`. Use `withContext: true` no fetch ou confira a dep `CurrentContextDep` no router.
- Listener de sessão em `app/db/session.py` deve estar registrado — se você mexeu nele, olhe o log.

## Valkey cheio em dev

```bash
docker compose exec valkey valkey-cli FLUSHALL
```

## Postgres cheio de schemas mun_* de teste

```bash
docker compose exec postgres psql -U zsaude -d zsaude -c "\
  SELECT nspname FROM pg_namespace WHERE nspname LIKE 'mun_%';"
```

Para apagar um:

```sql
DROP SCHEMA "mun_5201405" CASCADE;
DELETE FROM app.municipalities WHERE ibge = '5201405';
```

## Nada resolveu?

1. `docker compose down -v` (apaga volume — perde dados locais).
2. `docker compose up -d`.
3. `docker compose exec app alembic upgrade head`.
4. `docker compose exec app python -m scripts.seed`.

Volta para estado conhecido em ~1 minuto.
