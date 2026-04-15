# Comandos do dia a dia

Todos os comandos de backend rodam a partir de `backend/`. Frontend, a partir de `frontend/`.

## Subir / derrubar

```bash
# Backend
cd backend
docker compose up -d                   # sobe postgres, valkey, mailpit, app
docker compose down                    # para (mantém volume)
docker compose down -v                 # para e apaga dados (nuke completo)
docker compose logs -f app             # acompanhar logs
docker compose restart app             # reiniciar só o app

# Frontend
cd frontend
npm install                            # uma vez
npm run dev                            # Vite em :5173
npm run build                          # build de produção
npm run lint                           # eslint
```

## Banco e migrations

```bash
# Migrations do schema app
docker compose exec app alembic upgrade head
docker compose exec app alembic downgrade -1
docker compose exec app alembic history
docker compose exec app alembic revision --autogenerate -m "descrição"

# Migrations tenant (todos os municípios)
docker compose exec app python -m scripts.migrate_tenants
docker compose exec app python -m scripts.migrate_tenants --ibge 5208707
docker compose exec app python -m scripts.migrate_tenants --all

# Autogenerate de tenant (usa um schema existente como referência)
docker compose exec -e ALEMBIC_TENANT_SCHEMA=mun_5208707 app \
  alembic -c alembic_tenant.ini revision --autogenerate -m "descrição"
```

## Seed e superuser

```bash
docker compose exec app python -m scripts.seed
docker compose exec app python -m scripts.create_superuser
docker compose exec app python -m scripts.generate_jwt_keys
```

## psql

```bash
docker compose exec postgres psql -U zsaude -d zsaude

-- Listar tabelas do app
\dt app.*

-- Listar tabelas de um município
\dt mun_5208707.*

-- Versões Alembic
SELECT * FROM public.alembic_version;
SELECT * FROM mun_5208707.alembic_version;

-- Listar schemas mun_*
SELECT nspname FROM pg_namespace WHERE nspname LIKE 'mun_%';
```

## Valkey CLI

```bash
docker compose exec valkey valkey-cli

KEYS *
GET session:touch:<sid>
FLUSHDB                    # zera cache (dev)
```

## Testes (backend)

```bash
docker compose exec app uv run pytest
docker compose exec app uv run pytest tests/auth/
docker compose exec app uv run pytest -k test_login -v
```

## Lint e type-check

```bash
# Backend
docker compose exec app uv run ruff check .
docker compose exec app uv run ruff format .
docker compose exec app uv run basedpyright

# Frontend
npm run lint
npx tsc --noEmit
```

## Mailpit (dev)

E-mails enviados pelo backend (reset de senha etc.) caem em [http://localhost:8025](http://localhost:8025).

## Gerar tipos TS do OpenAPI (opcional)

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o frontend/src/api/schema.d.ts
```

## Portas

| Serviço | Porta |
|---|---|
| Frontend (Vite) | 5173 |
| Backend (FastAPI) | 8000 |
| Postgres | 5433 |
| Valkey | 6380 |
| Mailpit SMTP | 1025 |
| Mailpit UI | 8025 |
