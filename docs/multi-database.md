# Multi-Database: PostgreSQL + Oracle

## Visao Geral

O zSaude suporta PostgreSQL e Oracle como banco de dados. A escolha e feita
via variavel de ambiente `DATABASE_URL` na subida do Docker.

```
# PostgreSQL (padrao)
DATABASE_URL=postgresql+asyncpg://user:pass@pg:5432/zsaude

# Oracle
DATABASE_URL=oracle+oracledb://user:pass@oracle:1521/FREEPDB1
```

Cada municipio pode opcionalmente usar uma conexao propria (PG ou Oracle),
independente do banco principal. Isso e configurado na tabela
`app.municipality_databases`.

## Arquitetura

```
Aplicacao (dialect-agnostica)
    |
Camada de Traducao
    ├── Tipos Portaveis (UUIDType, JSONType, ArrayAsJSON)
    ├── DialectAdapter (ABC)
    │   ├── PostgreSQLAdapter
    │   └── OracleAdapter
    └── EngineRegistry (roteamento por municipio)
```

### Tipos Portaveis (`app/db/types.py`)

TypeDecorators do SQLAlchemy que resolvem automaticamente por dialect:

| Tipo | PostgreSQL | Oracle | Fallback |
|------|-----------|--------|----------|
| `UUIDType()` | UUID nativo | RAW(16) | CHAR(36) |
| `JSONType()` | JSONB | CLOB + JSON serialize | Text |
| `ArrayAsJSON()` | ARRAY(String) | CLOB + JSON serialize | Text |

### Dialect Adapter (`app/db/dialect/`)

Interface que encapsula operacoes dialect-specific:

- `set_search_path(conn, ibge)` — PG: SET LOCAL search_path / Oracle: ALTER SESSION
- `set_session_vars(conn, vars)` — PG: set_config() / Oracle: DBMS_SESSION.SET_CONTEXT
- `upsert(table, values, ...)` — PG: INSERT ON CONFLICT / Oracle: MERGE INTO
- `create_schema(conn, name)` — PG: CREATE SCHEMA / Oracle: CREATE USER
- `drop_schema(conn, name)` — PG: DROP SCHEMA / Oracle: DROP USER

### Engine Registry (`app/db/engine_registry.py`)

Gerencia conexoes:
- `app_engine` — banco principal (PG ou Oracle)
- `tenant_engine(ibge)` — override por municipio ou fallback para app_engine

## Regras para Desenvolvedores

### Ao criar models

```python
# CORRETO - tipos portaveis
from app.db.types import UUIDType, JSONType, new_uuid7

id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
data: Mapped[dict] = mapped_column(JSONType(), nullable=False)

# ERRADO - acoplado ao PostgreSQL
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
```

### Ao fazer upserts

```python
# CORRETO - adapter portavel
from app.db.dialect import get_adapter

adapter = get_adapter(session.bind.dialect.name)
stmt = adapter.upsert(
    MyModel, values,
    index_elements=["unique_col"],
    update_columns=["col1", "col2"],
)
await session.execute(stmt)

# ERRADO - pg_insert direto
from sqlalchemy.dialects.postgresql import insert as pg_insert
```

### Imports de sqlalchemy.dialects

Imports de `sqlalchemy.dialects.postgresql` (ou oracle) sao permitidos APENAS em:
- `app/db/types.py` (dentro de `load_dialect_impl`)
- `app/db/dialect/postgresql.py` / `oracle.py`

Nenhum outro arquivo deve importar de `sqlalchemy.dialects`.

## Deploy

### PostgreSQL (padrao)

```bash
docker compose up
```

### Oracle

```bash
docker compose -f docker-compose.oracle.yml up
```

Requer arquivo `.env.oracle` com:
```
DATABASE_URL=oracle+oracledb://zsaude:zsaude_dev_password@oracle:1521/FREEPDB1
```

### Override por Municipio

Inserir na tabela `app.municipality_databases`:

```sql
INSERT INTO app.municipality_databases (municipality_id, dialect, connection_url_encrypted, pool_size)
VALUES ('uuid-do-municipio', 'oracle', 'fernet:v1:...', 5);
```

A connection_url deve ser cifrada com Fernet (mesmo mecanismo das API keys de IA).

## Limitacoes

### pgvector (Reconhecimento Facial)

O modulo de reconhecimento facial usa pgvector (Vector, cosine distance).
Em bancos Oracle, o modulo retorna `disabled` automaticamente:

- `enroll_from_photo()` retorna status `"disabled"`
- `match()` levanta `FaceError(code="unsupported")`

O frontend deve esconder botoes de reconhecimento facial quando o backend
reportar que o recurso nao esta disponivel.

### Tabelas com Features PG-only

- `AIUsageLog` — particionamento por RANGE(at) so funciona em PG
- Partial unique indexes (Role) — PG-only, Oracle usa function-based index

## Escala

| Cenario | Pool Total | Nota |
|---------|-----------|------|
| Tudo PG | 20+10 conexoes | Pool unico |
| Tudo Oracle | 20+10 conexoes | Pool unico |
| PG + 10 overrides Oracle | 20+10 + 10*5 = 80 | 1 pool por override |
| PG + 100 overrides | 20+10 + 100*5 = 530 | Considerar pool_size menor |

Overrides que compartilham o mesmo servidor podem ser agrupados em um unico
engine (otimizacao futura).
