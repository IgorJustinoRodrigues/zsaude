# zSaúde — Backend

API REST do zSaúde, gestão de saúde municipal.

## Stack

- Python 3.13 + FastAPI + SQLAlchemy 2.x async + asyncpg
- PostgreSQL 17 com Row-Level Security
- Valkey 8 (cache / rate-limit)
- Pydantic v2 · Argon2id + pepper · JWT RS256 (access 15 min + refresh 30 dias com rotação)
- uv (gerenciador de pacotes) · Ruff · basedpyright · pytest + testcontainers

## Onboarding

```bash
# 1. Copiar variáveis de ambiente
cp .env.example .env

# 2. Gerar par de chaves JWT
mkdir -p secrets
docker compose run --rm app uv run python -m scripts.generate_jwt_keys

# 3. Subir tudo
docker compose up -d

# 4. Aplicar migrations
docker compose exec app uv run alembic upgrade head

# 5. Popular dados de desenvolvimento
docker compose exec app uv run python -m scripts.seed
```

## URLs (dev)

- API: <http://localhost:8000>
- Swagger: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>
- OpenAPI JSON: <http://localhost:8000/openapi.json>
- Health: <http://localhost:8000/health>
- MailHog (e-mails capturados): <http://localhost:8025>

## Credenciais de desenvolvimento

Após `scripts.seed`, todos os usuários seed usam a senha: `Admin@123`

Logins disponíveis (batem com os mocks do frontend):
`igor.santos`, `carla.mendonca`, `diego.figueiredo`, `renata.cabral`, `thales.marques`, `simone.araujo`, `rafael.campos`, `fernanda.lima`, `paulo.henrique`, `beatriz.nunes`, `marcos.vinicius`, `juliana.torres`.

## Comandos frequentes

```bash
# Rodar testes
docker compose exec app uv run pytest

# Lint + format
docker compose exec app uv run ruff check . --fix
docker compose exec app uv run ruff format .

# Type check
docker compose exec app uv run basedpyright

# Gerar nova migration
docker compose exec app uv run alembic revision --autogenerate -m "descrição"

# Aplicar migrations
docker compose exec app uv run alembic upgrade head

# Downgrade 1 revisão
docker compose exec app uv run alembic downgrade -1
```

## Arquitetura em camadas

```
router (HTTP)  →  service (regra de negócio)  →  repository (acesso DB)  →  models (ORM)
                                                                            ↑
schemas (Pydantic I/O) ↔ router + service                                 db/
```

Regras:
- Repositories retornam ORM; services convertem para/de schemas Pydantic.
- Routers nunca chamam repositories diretamente.
- Imports cross-module passam por services (nunca repositories).

## Multi-tenancy

- **WorkContext** (município + unidade) é obrigatório em toda query tenant-scoped.
- Aplicado em 2 camadas:
  1. **Aplicação**: dependency `current_context` filtra via SQLAlchemy.
  2. **Banco**: Row-Level Security via `SET LOCAL app.current_municipality_id` / `app.current_facility_id` por transação.

## Segurança

- Senhas: Argon2id + pepper HMAC-SHA256 em `PASSWORD_PEPPER`.
- JWT RS256; rotação de refresh com detecção de replay (kill family).
- Rate-limit em `/auth/login` e `/auth/forgot-password`.
- Headers de segurança (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- CORS whitelist explícita.
- Auditoria via decorator `@audited` + `AuditLog` table + Valkey stream.

## Fora do escopo desta entrega

Módulos de domínio (CLN, DGN, HSP, PLN, FSC, OPS), consumer do audit stream, upload de foto com crop, WebSocket, geração de PDF, terminologias (CBO/CID/SIGTAP).
