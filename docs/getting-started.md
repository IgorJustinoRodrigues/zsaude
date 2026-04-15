# Primeiros passos

Instruções para rodar o zSaúde localmente pela primeira vez.

## Pré-requisitos

- **Docker + Docker Compose** (backend roda 100% em container).
- **Node 20+** e **npm 10+** (frontend roda no host para hot reload mais rápido).
- Nada de Python/Postgres instalado no host — tudo dentro do container.

## 1. Clone e variáveis de ambiente

```bash
git clone <repo> zsaude && cd zsaude
cp backend/.env.example backend/.env
```

O `.env.example` já tem valores funcionais para dev. Se quiser gerar novas chaves JWT:

```bash
cd backend && uv run python -m scripts.generate_jwt_keys
```

## 2. Subir o backend

```bash
cd backend
docker compose up -d
```

Sobem quatro serviços: `postgres` (5433), `valkey` (6380), `mailhog` (8025 UI) e `app` (8000). O `docker-compose.override.yml` liga hot-reload com uvicorn.

Verificação rápida:

```bash
curl localhost:8000/health
# {"status":"ok","db":"ok","valkey":"ok"}
```

Abrir [http://localhost:8000/docs](http://localhost:8000/docs) para ver o Swagger.

## 3. Aplicar migrations e popular o banco

```bash
docker compose exec app alembic upgrade head      # schema app (compartilhado)
docker compose exec app python -m scripts.seed    # municípios, unidades, users + schemas tenant
```

O `seed.py` é idempotente: roda várias vezes sem duplicar. Ele também provisiona um schema `mun_<ibge>` por município e aplica as tenant migrations neles.

## 4. Subir o frontend

```bash
cd frontend
npm install
npm run dev
```

Abre em [http://localhost:5173](http://localhost:5173).

## 5. Primeiro login

- **Login:** `igor.santos`
- **Senha:** `Admin@123`

Esse usuário é **MASTER** (gerencia municípios, unidades, configurações globais). Os demais usuários seed também usam `Admin@123`.

Após logar:

1. Se for MASTER, cai no painel `/sys/dashboard`.
2. Se não, escolhe módulo → município/unidade → home do módulo.

## Próximos passos

- [Arquitetura](./architecture/overview.md) — panorama da stack.
- [Multi-tenant](./backend/multi-tenant.md) — como os schemas funcionam.
- [Comandos do dia a dia](./operations/commands.md).
