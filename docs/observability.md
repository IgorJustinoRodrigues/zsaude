# Observabilidade — Prometheus + Grafana + Loki

Guia completo da stack de observabilidade do zSaúde. Cobre **métricas**
(Prometheus), **dashboards** (Grafana) e **logs estruturados** (Loki)
— como funciona, como acessar, como adicionar novas métricas e como
operar.

---

## 1. Visão geral da stack

```
┌──────────────┐  /metrics  ┌────────────┐
│  zSaúde API  │───────────▶│ Prometheus │
│  (FastAPI)   │            │  (scrape   │──┐
│  structlog   │            │   15s)     │  │
└──────┬───────┘            └────────────┘  │
       │ stdout (JSON)                      │
       │                                    ▼
       ▼           Docker socket      ┌──────────┐
┌──────────┐  docker_sd  ┌─────────┐  │ Grafana  │
│ containers│────────────▶│ Promtail │──▶│  (dash-  │
│  (stdout) │             │          │  │  boards) │
└───────────┘             └────┬─────┘  └──────────┘
                               │              ▲
                               ▼              │
                         ┌──────────┐         │
                         │   Loki   │─────────┘
                         │  (logs)  │
                         └──────────┘
```

| Serviço | Papel | Porta host |
|---|---|---|
| `prometheus` | Scrapeia `/metrics` do app a cada 15s | `9090` |
| `loki` | Armazena logs estruturados | `3100` |
| `promtail` | Lê stdout dos containers Docker e manda pro Loki | `9080` (interno) |
| `grafana` | UI de dashboards — consulta Prometheus + Loki | `3000` |

Configuração: `backend/docker-compose.yml` linhas 99–149.
Config dos serviços: `backend/observability/`.

---

## 2. Como acessar

### 2.1. Grafana

```
http://localhost:3000
```

Login padrão em dev: `admin` / `admin` (configurado via env vars no
compose). Usuário anônimo também tem acesso como `Viewer`.

Dashboards pré-provisionados (pasta **zSaude**):

- **zSaude - API Overview** — visão geral global
- **zSaude - Análise por Município** — drill-down por IBGE

### 2.2. Prometheus (raw)

```
http://localhost:9090
```

Útil para:
- **Status → Targets** — confirmar que `zsaude-api` está `UP`
- **Graph** — rodar queries PromQL ad-hoc

### 2.3. Endpoint `/metrics` do app

```
curl http://localhost:8008/metrics
```

Expõe todas as métricas em formato Prometheus texto. Não exige auth
(protegido por network na produção).

---

## 3. Métricas expostas

Arquivo canônico: `backend/app/core/metrics.py`.

### 3.1. HTTP

| Métrica | Tipo | Labels | Uso |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `path`, `status`, `municipality` | Taxa de requests, error rate |
| `http_request_duration_seconds` | Histogram | `method`, `path`, `municipality` | Latência p50/p95/p99 |
| `http_requests_in_progress` | Gauge | `method` | Requests ativos no momento |

Coletadas automaticamente pelo `MetricsMiddleware`
(`app/middleware/metrics.py`).

**Normalização de path** — UUIDs/IDs são substituídos por `{id}` para
evitar explosão de cardinalidade. `GET /api/v1/hsp/patients/abc-123` é
contado como `GET /api/v1/hsp/patients/{id}`.

**Label `municipality`** — extraído do JWT `X-Work-Context`
(sem validação de assinatura, só pra labelar). `global` quando não há contexto.

**Paths ignorados** (não entram nas métricas): `/health`, `/metrics`,
`/openapi.json`, `/docs`, `/redoc`.

### 3.2. Autenticação

| Métrica | Tipo | Labels |
|---|---|---|
| `auth_login_total` | Counter | `status` = `success` / `invalid_credentials` / `blocked` / `inactive` |

Incrementada no `AuthService.login` (`app/modules/auth/service.py`).

### 3.3. Banco de dados

| Métrica | Tipo | Uso |
|---|---|---|
| `db_pool_size` | Gauge | Tamanho configurado do pool |
| `db_pool_checked_in` | Gauge | Conexões ociosas |
| `db_pool_checked_out` | Gauge | Conexões em uso |
| `db_pool_overflow` | Gauge | Conexões além do pool base |

Para saturação: alertar quando `checked_out / size > 0.8`.

### 3.4. AI Gateway

| Métrica | Tipo | Labels |
|---|---|---|
| `ai_requests_total` | Counter | `provider`, `capability`, `status` |
| `ai_request_duration_seconds` | Histogram | `provider` |

Úteis pra custo (contar chamadas por provider) e latência de LLM/IA.

### 3.5. Negócio

| Métrica | Tipo | Labels | Atualizada em |
|---|---|---|---|
| `active_municipalities_total` | Gauge | — | Lifespan startup |
| `active_users_total` | Gauge | — | Lifespan startup |
| `patients_total` | Gauge | — | (reservado — atualizar em cron) |
| `municipality_info` | Gauge | `ibge`, `name`, `state` | Lifespan startup |
| `zsaude` | Info | `version`, `env` | Lifespan startup |

> `municipality_info` é o truque de "info metric": valor sempre `1`,
> os labels carregam os dados. Permite join PromQL para traduzir IBGE
> em nome amigável (é o que os dashboards usam).

---

## 4. Dashboards

Provisionados em `backend/observability/grafana/dashboards/*.json`.
Carregados automaticamente no container Grafana via
`provisioning/dashboards/dashboards.yml`.

### 4.1. API Overview (`api-overview.json`)

Visão geral da API — 14 painéis:

**Topo (KPIs):**
- Requests/segundo (por status, stacked)
- Latência p50/p95/p99
- Error rate %
- Requests ativos agora
- Total em 24h
- Logins OK / falhos (última hora)
- Municípios / usuários ativos

**Meio:**
- Requests por município (barras)
- DB Pool connections

**Base:**
- Top 10 endpoints mais lentos (p95)
- Requests por município ao longo do tempo
- **Logs recentes** (painel Loki — últimas 200 linhas do service `app`)

**Filtros** (template variables):
- `municipality` → nome amigável do município (multi-select)
- `ibge` → derivado de `municipality` (oculto, usado nas queries)

### 4.2. Análise por Município (`municipio.json`)

Drill-down por IBGE — 18 painéis específicos de um município:
KPIs da unidade, top endpoints, distribuição HTTP/método, erros 5xx,
logs filtrados por `municipality_ibge`.

Escolha o município pelo dropdown `$municipio`.

---

## 5. Logs estruturados (Loki)

### 5.1. Como chegam

O app loga em **stdout** via `structlog` em JSON:

```json
{
  "timestamp": "2026-04-18T12:05:21Z",
  "level": "info",
  "event": "face_reindex_complete",
  "request_id": "b97976b9...",
  "user": "igor",
  "municipality_ibge": "5208608",
  "processed": 950
}
```

**Promtail** descobre containers via docker socket, parseia o JSON
e extrai labels (`level`, `event`, `user`, `municipality_ibge`,
`container`, `service`, `project`).

Config: `backend/observability/promtail.yml`.

### 5.2. Consultar no Grafana

**Explore → datasource Loki**:

```logql
# Todos os logs do app
{service="app"}

# Só erros
{service="app", level="error"}

# Logs de 1 município específico
{service="app", municipality_ibge="5208608"}

# Eventos face*
{service="app"} |= "face_"

# Parse JSON e filtrar por campo
{service="app"} | json | processed > 100
```

### 5.3. audit_logs vs structlog

**Não confunda** (ver `docs/audit-logging.md`):

| | audit_logs (DB) | structlog (Loki) |
|---|---|---|
| Persistência | tabela `app.audit_logs` | Loki (retenção curta) |
| Granularidade | ações de negócio | eventos técnicos/infra |
| UI | `/ops/audit`, `/sys/audit` | Grafana Explore |
| Exemplo | `"Igor editou paciente João"` | `face_model_loaded` |

---

## 6. Queries PromQL úteis

### 6.1. Saúde da API

```promql
# RPS total
sum(rate(http_requests_total[1m]))

# RPS por status
sum(rate(http_requests_total[1m])) by (status)

# Error rate (%)
100 * sum(rate(http_requests_total{status=~"5.."}[5m]))
      / sum(rate(http_requests_total[5m]))

# Latência p95 global
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Top 10 endpoints mais lentos (p95)
topk(10, histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path)))
```

### 6.2. Por município (join com `municipality_info`)

```promql
# RPS por município, mostrando o nome (não só IBGE)
sum(rate(http_requests_total[1m])) by (municipality)
* on(municipality) group_left(name, state)
  label_replace(municipality_info, "municipality", "$1", "ibge", "(.*)")
```

### 6.3. Auth

```promql
# Taxa de logins bem-sucedidos
rate(auth_login_total{status="success"}[5m])

# Tentativas inválidas (potencial brute force)
sum(rate(auth_login_total{status="invalid_credentials"}[5m]))
```

### 6.4. DB pool

```promql
# Saturação do pool (%)
100 * db_pool_checked_out / db_pool_size

# Uso de overflow — indica pool subdimensionado
db_pool_overflow > 0
```

### 6.5. AI Gateway (custo / erros)

```promql
# Chamadas por provider
sum(rate(ai_requests_total[1h])) by (provider)

# Taxa de erro por capability
sum(rate(ai_requests_total{status="error"}[5m])) by (capability)
 /
sum(rate(ai_requests_total[5m])) by (capability)

# Latência p95 por provider
histogram_quantile(0.95,
  sum(rate(ai_request_duration_seconds_bucket[5m])) by (le, provider))
```

---

## 7. Como adicionar uma nova métrica

### 7.1. Declare em `app/core/metrics.py`

Escolha o tipo certo:

- **Counter** — contagem monotônica (requests, erros, eventos). Nunca diminui.
- **Gauge** — valor atual (conexões ativas, usuários online). Sobe e desce.
- **Histogram** — distribuição (latência, tamanho). Exposto em buckets.
- **Info** — metadados constantes (versão, env).

```python
# Exemplo: nova métrica de exports de relatório
REPORT_EXPORTS_TOTAL = Counter(
    "report_exports_total",
    "Relatórios exportados",
    ["format", "module"],   # labels de baixa cardinalidade!
)

REPORT_EXPORT_DURATION = Histogram(
    "report_export_duration_seconds",
    "Tempo de export de relatório",
    ["format"],
    buckets=[0.1, 0.5, 1, 2.5, 5, 10, 30],
)
```

**Regras de cardinalidade** (para não explodir o Prometheus):
- ✅ OK: `status`, `method`, `module`, `provider`, `format` (valores fixos)
- ⚠ Cuidado: `municipality` (dezenas de valores) — aceitável
- ❌ Nunca: `user_id`, `patient_id`, `request_id`, qualquer UUID

### 7.2. Incremente no código

```python
from app.core.metrics import REPORT_EXPORTS_TOTAL, REPORT_EXPORT_DURATION
import time

start = time.perf_counter()
try:
    data = generate_report(...)
    REPORT_EXPORTS_TOTAL.labels(format="pdf", module="hsp").inc()
finally:
    REPORT_EXPORT_DURATION.labels(format="pdf").observe(time.perf_counter() - start)
```

### 7.3. Valide

```bash
curl -s http://localhost:8008/metrics | grep report_exports
```

Deve aparecer a linha `HELP` + `TYPE` + série(s).

### 7.4. Adicione painel no Grafana

Edite `backend/observability/grafana/dashboards/api-overview.json`
(ou crie um novo dashboard JSON na mesma pasta). Restart Grafana
ou aguarde o provisioner recarregar (~10s).

---

## 8. Como adicionar novo log estruturado

```python
from app.core.logging import get_logger

log = get_logger(__name__)

# Info com campos estruturados
log.info("report_generated", format="pdf", rows=1200, duration_ms=450)

# Warning com erro
log.warning("ai_rate_limited", provider="openai", retry_after_s=30)
```

O Promtail parseia o JSON automaticamente — campos se tornam **labels
indexáveis** no Loki. Veja `promtail.yml` `pipeline_stages → labels`
para os campos já reconhecidos; adicione novos ali se precisar
filtrar por eles.

**Não logue PHI** em structlog (CPF, nome completo, foto). PHI vai
no `audit_logs` com severity apropriada.

---

## 9. Alertas sugeridos (não configurados ainda)

O Grafana tem engine de alertas nativo (**Alerting → Alert rules**).
Sugestões para configurar quando for pra produção:

| Nome | Condição | Severidade |
|---|---|---|
| API DOWN | `up{job="zsaude-api"} == 0` por 2min | critical |
| Error rate alto | `error_rate > 5%` por 5min | warning |
| Error rate crítico | `error_rate > 20%` por 1min | critical |
| Latência p95 degradada | `p95 > 2s` por 10min | warning |
| Pool DB saturado | `checked_out / size > 0.9` por 5min | warning |
| Brute force | `rate(auth_login_total{status="invalid_credentials"}[5m]) > 10` | warning |
| Replay token | `increase(auth_login_total{status="invalid_credentials"}[1m]) > 0` com severity `critical` no audit | critical |
| AI error rate | `ai_error_rate > 10%` por 5min | warning |

Contatos (canal Slack/email) configurados em Grafana → Alerting →
Contact points.

---

## 10. Operação

### 10.1. Subir a stack

```bash
cd backend
docker compose up -d prometheus loki promtail grafana
```

Ou tudo junto: `docker compose up -d`.

### 10.2. Ver logs da stack de observabilidade

```bash
docker compose logs -f prometheus
docker compose logs -f loki
docker compose logs -f grafana
docker compose logs -f promtail
```

### 10.3. Resetar dados

```bash
# Apaga todas as séries históricas do Prometheus
docker compose down
docker volume rm backend_prometheus_data

# Apaga todos os logs do Loki
docker volume rm backend_loki_data

# Reseta dashboards/users editados do Grafana
# (os dashboards provisionados via JSON continuam)
docker volume rm backend_grafana_data
```

### 10.4. Retenção

Default do Prometheus: 15 dias. Para ajustar, edite o serviço em
`docker-compose.yml`:

```yaml
prometheus:
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.retention.time=90d'
```

Loki: configurado em `loki.yml` (default filesystem, sem retention
automática — adicione `limits_config.retention_period: 720h` para 30d).

### 10.5. Produção

Antes de subir em produção:

- [ ] Trocar senha do Grafana (`GF_SECURITY_ADMIN_PASSWORD`)
- [ ] Desabilitar acesso anônimo (`GF_AUTH_ANONYMOUS_ENABLED=false`)
- [ ] Proteger `/metrics` do app (auth, network policy ou binding interno)
- [ ] Habilitar HTTPS no Grafana (via reverse proxy)
- [ ] Configurar retention nos volumes (15–90d Prometheus, 30d Loki)
- [ ] Definir alertas críticos (API down, error rate, pool DB)
- [ ] Configurar SMTP/Slack pra notificações
- [ ] Fazer backup do volume `grafana_data` (configs customizadas)

---

## 11. Troubleshooting

| Sintoma | Diagnóstico | Solução |
|---|---|---|
| Dashboards vazios | Prometheus não consegue scrapear o app | Em Prometheus → Status → Targets, verifique `zsaude-api UP`. Se DOWN, `docker compose ps` — app saudável? |
| Só mostra métrica `global` | Usuário não selecionou contexto de trabalho (sem `X-Work-Context`) | Normal em chamadas pré-login e de MASTER |
| Latência p95 explode ao mudar rota | Cardinalidade do path | Confirme que UUIDs estão sendo normalizados em `_normalize_path` |
| Logs não aparecem | Promtail não lê docker socket | `docker compose logs promtail` — erro de permissão no socket? |
| Dashboard novo não aparece | JSON inválido | `docker compose logs grafana` — procure `dashboard_provisioning_error` |
| `/metrics` retorna 404 | Middleware não registrado | Verifique `create_app()` em `app/main.py` — `metrics_router` deve ser incluído |

---

## 12. Referências internas

- **Métricas**: `backend/app/core/metrics.py`
- **HTTP middleware**: `backend/app/middleware/metrics.py`
- **Login counter**: `backend/app/modules/auth/service.py`
- **Bootstrap de labels**: `backend/app/main.py` (`lifespan`)
- **Config Prometheus**: `backend/observability/prometheus.yml`
- **Config Loki**: `backend/observability/loki.yml`
- **Config Promtail**: `backend/observability/promtail.yml`
- **Datasources Grafana**: `backend/observability/grafana/provisioning/datasources/datasources.yml`
- **Dashboards JSON**: `backend/observability/grafana/dashboards/*.json`
- **Compose**: `backend/docker-compose.yml` linhas 99–149

Ver também:
- `docs/audit-logging.md` — audit de negócio (DB, aparece na UI do app)
- `docs/operations/commands.md` — comandos Docker comuns
- `docs/operations/troubleshooting.md` — problemas de infraestrutura
