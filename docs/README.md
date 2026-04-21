# Documentação do zSaúde

Sistema de gestão de saúde municipal — arquitetura multi-tenant (schema por município), React + FastAPI + PostgreSQL.

## Primeiros passos

- [**Onboarding**](./getting-started.md) — rodar o projeto localmente pela primeira vez.
- [**Arquitetura**](./architecture/overview.md) — visão geral de stack, camadas e multi-tenancy.

## Backend

Python 3.13 · FastAPI · SQLAlchemy async · PostgreSQL 17 · Alembic

- [Estrutura do backend](./backend/structure.md) — camadas, convenções, organização por módulo.
- [Multi-tenant: schema por município](./backend/multi-tenant.md) — como o isolamento funciona.
- [**Migrations (app + tenant)**](./backend/migrations.md) — criar, aplicar, resetar.
- [**Criar tabelas** (app / tenant)](./backend/creating-tables.md) — passo a passo completo.
- [Criar um novo endpoint](./backend/creating-endpoints.md) — fluxo recomendado.
- [**RBAC (perfis e permissões)**](./backend/rbac.md) — catálogo, roles, overrides, resolução.
- [Auditoria e sessões](./backend/audit-and-sessions.md) — como os logs e a presença funcionam.
- [Segurança](./backend/security.md) — níveis MASTER/ADMIN/USER, escopo, JWT.
- [**Gateway de IA**](./backend/ai-gateway.md) — consumo provider-agnostic, chaves cifradas, rotas, operations.
- [**Gateway de IA — receitas**](./backend/ai-gateway-recipes.md) — passo-a-passo pra criar operations, embeddings, vision, triagem, busca semântica, assistente.

## Frontend

React 19 · Vite · TypeScript · Tailwind · Zustand

- [Estrutura do frontend](./frontend/structure.md) — pastas, stores, roteamento.
- [Cliente HTTP e módulos de API](./frontend/api-clients.md) — como chamar o backend.
- [Páginas, rotas e guards](./frontend/pages-and-guards.md) — como adicionar e proteger.
- [**RBAC no frontend**](./frontend/rbac.md) — `can()`, matriz de permissões, overrides.
- [Toasts](./frontend/toasts.md) — feedback visual de ações.

## Módulos

- [**Módulo Recepção (`rec`)**](./rec-module.md) — totem, painel, balcão; config em cascata município→unidade; telas MASTER de personalização.
- [**Dispositivos & tempo real**](./devices.md) — pareamento de totens/painéis, WebSocket, Valkey pub/sub.

## Operação

- [Comandos do dia a dia](./operations/commands.md) — docker, seed, migrations, testes.
- [Troubleshooting](./operations/troubleshooting.md) — problemas comuns.
- [**Audit logs**](./audit-logging.md) — padrão PT-BR, helpers, middleware, checklist.
- [**Observabilidade**](./observability.md) — Prometheus, Grafana, Loki, métricas, dashboards.

---

## Contexto rápido

- Monorepo com duas pastas: [`frontend/`](../frontend) e [`backend/`](../backend).
- Backend roda via `docker compose up -d` na pasta `backend/`.
- Frontend roda via `npm run dev` na pasta `frontend/`.
- MASTER (Igor Santos, senha `Admin@123`) gerencia a plataforma (municípios, unidades, configs).
- Cada município vira um **schema** no Postgres (`mun_<ibge>`), com suas próprias tabelas operacionais (pacientes, atendimentos etc).
- Tabelas compartilhadas (usuários, diretório, auditoria, sessões) vivem no schema **`app`**.
