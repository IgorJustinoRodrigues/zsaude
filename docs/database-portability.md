# Portabilidade Postgres + Oracle

Documentação técnica de como o `zsaude` suporta **PostgreSQL** e **Oracle
23ai** com a mesma base de código: tipos portáveis, adapter de dialect,
migrations e provisionamento.

## Sumário

1. [Visão geral](#visão-geral)
2. [Tipos SQLAlchemy portáveis](#tipos-sqlalchemy-portáveis)
3. [Adapter de dialect](#adapter-de-dialect)
4. [Fluxo de bootstrap](#fluxo-de-bootstrap)
5. [Migrations (Postgres)](#migrations-postgres)
6. [Provisionamento (Oracle)](#provisionamento-oracle)
7. [Módulo de seeds](#módulo-de-seeds)
8. [Reconhecimento facial (vetor)](#reconhecimento-facial-vetor)
9. [Checklist para nova migration](#checklist-para-nova-migration)
10. [Checklist para novo model](#checklist-para-novo-model)
11. [Gotchas e troubleshooting](#gotchas-e-troubleshooting)

---

## Visão geral

O projeto tem dois schemas lógicos:

- `app` — dados globais (usuários, RBAC, municípios, IA, referências DATASUS).
- `mun_<ibge>` — um schema por município (pacientes, fotos, CNES, embeddings).

| Banco | Schema `app` | Schemas `mun_*` |
|---|---|---|
| Postgres | Alembic (`migrations/`) | Alembic (`migrations_tenant/`) |
| Oracle 23ai | `provision_app_schema()` (`app/db/provisioning.py`) | `ensure_municipality_schema()` (`app/db/tenant_schemas.py`) |

Em **Postgres**, as migrations Alembic usam recursos nativos (`pgvector`,
`JSONB`, `ARRAY`, `unaccent`). Em **Oracle**, as migrations não rodam — o
provisionamento usa `metadata.create_all` dos models + seeds programáticos.

**Os models SQLAlchemy são os mesmos** para ambos os bancos. O que muda é
o tipo "físico" gerado no banco (via `TypeDecorator.load_dialect_impl`) e
o SQL runtime (via `DialectAdapter`).

---

## Tipos SQLAlchemy portáveis

Definidos em `app/db/types.py`. Cada `TypeDecorator` delega para o tipo
**nativo** do banco alvo — sem serialização Python manual a menos que
necessário.

| Tipo abstrato | PostgreSQL | Oracle 23ai |
|---|---|---|
| `UUIDType()` | `UUID` (16 bytes) | `RAW(16)` |
| `JSONType()` | `JSONB` | `JSON` (OSON binário, 21c+) |
| `ArrayAsJSON(item)` | `ARRAY(item)` | `JSON` (lista) |
| `VectorType(N)` | `vector(N)` (pgvector) | `VECTOR(N, FLOAT32)` |

### Convenções de uso

**Sempre** usar os tipos abstratos em models (`app/**/models.py`):

```python
from app.db.types import UUIDType, JSONType, VectorType, new_uuid7

class Foo(Base):
    __tablename__ = "foo"
    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    meta: Mapped[dict] = mapped_column(JSONType(), nullable=False, default=dict)
    embed: Mapped[list[float]] = mapped_column(VectorType(512), nullable=False)
```

Também valem em migrations — permite que a mesma migration rode em ambos
os bancos (mesmo que na prática só rode em Postgres):

```python
import sqlalchemy as sa
from alembic import op
from app.db.types import UUIDType

def upgrade() -> None:
    op.create_table("foo",
        sa.Column("id", UUIDType(), primary_key=True),
        ...
    )
```

### Decisões chave nos tipos

- **`UUID` → `RAW(16)` em Oracle**: RAW é binário compacto e indexável —
  equivalente ao UUID do Postgres. O `process_bind_param` faz
  `uuid.UUID` → `bytes`.
- **`JSON` nativo Oracle 21c+**: OSON binário com `JSON_VALUE`,
  `JSON_QUERY`. Binding por string JSON (driver converte internamente).
- **`VECTOR` Oracle 23ai AI Vector Search**: suporta distâncias coseno,
  L2, Manhattan, com índices HNSW ou IVF. `process_bind_param` converte
  `list[float]` → `array.array("f", ...)` (requer pelo driver oracledb).
- **`server_default=" "` (um espaço)** em colunas `nullable=False`: em
  Oracle, string vazia `""` é tratada como `NULL` — isso quebra NOT NULL.
  Um espaço satisfaz a constraint e é semanticamente próximo a "vazio"
  (app faz `.strip()`). Ver seção [Gotchas](#gotchas-e-troubleshooting).

---

## Adapter de dialect

`app/db/dialect/base.py` define `DialectAdapter` com API unificada para
operações que variam entre bancos. Implementações concretas em
`postgresql.py` e `oracle.py`.

### Métodos principais

```python
adapter.set_search_path(conn, ibge)        # PG: SET search_path / Oracle: ALTER SESSION SET CURRENT_SCHEMA
adapter.create_schema(conn, name)          # PG: CREATE SCHEMA / Oracle: CREATE USER
adapter.upsert(table, values, ...)         # PG: ON CONFLICT / Oracle: MERGE INTO
adapter.vector_cosine_distance_sql(col, p) # PG: col <=> CAST(:p AS vector) / Oracle: VECTOR_DISTANCE(col, :p, COSINE)
adapter.create_vector_index_sql(...)       # PG: hnsw (col vector_cosine_ops) / Oracle: VECTOR INDEX ORGANIZATION NEIGHBOR PARTITIONS
adapter.unaccent_upper_expr(col)           # PG: UPPER(unaccent(col)) / Oracle: NLS_UPPER(col, 'NLS_SORT=BINARY_AI')
adapter.func_gen_uuid_sql()                # PG: gen_random_uuid() / Oracle: SYS_GUID()
```

### Obtendo o adapter

```python
from app.db.dialect import get_adapter

adapter = get_adapter(session.bind.dialect.name)
```

### Regra de ouro

**Nunca** escreva operator/função banco-específico direto no código
Python — sempre via adapter. Exemplo:

```python
# ❌ errado — quebra em Oracle
stmt = text("SELECT ... WHERE embedding <=> :q <= :max_dist")

# ✅ certo
dist = adapter.vector_cosine_distance_sql("embedding", "q")
stmt = text(f"SELECT ... WHERE ({dist}) <= :max_dist")
```

### Coerção de tipos no upsert Oracle

O MERGE cru do Oracle não aplica `TypeDecorator` automaticamente. O
`OracleAdapter.execute_upsert` inspeciona `table.__table__.columns` e
converte cada valor conforme o tipo declarado:

- `UUIDType` → `bytes` (via `uuid.UUID.bytes`)
- `JSONType`, `ArrayAsJSON` → `json.dumps(v)`
- `VectorType` → `array.array("f", v)`
- `bool` → `int` (1/0)

Caller passa valores Python normais, adapter resolve.

---

## Fluxo de bootstrap

### Postgres (dev/prod)

```bash
# Uma vez (ou após nova migration):
docker compose up -d postgres
alembic upgrade head                                       # schema app
alembic -c alembic_tenant.ini -x tenant_schema=mun_5208707 upgrade head   # por município
```

Na inicialização do app, `main.py` roda:
1. `sync_permissions()` — upsert do catálogo de permissões Python → DB.
2. `ensure_system_base_roles()` — cria roles SYSTEM se ausentes.
3. `SettingsService.warm_up()` — carrega `system_settings` no cache.

### Oracle (prod)

```python
from app.db.provisioning import provision_app_schema
from app.db.session import engine

# Configurar DATABASE_URL=oracle+oracledb://app:senha@host:1521/?service_name=XE
await provision_app_schema(engine(), apply_seeds=True)
```

Depois subir o app normalmente — `main.py` roda os mesmos
`sync_permissions`/`warm_up`.

Para cada município:
```python
from app.db.tenant_schemas import ensure_municipality_schema

async with AsyncSession(engine()) as s:
    await ensure_municipality_schema(s, "5208707", apply_migrations=True, engine=engine())
```

---

## Migrations (Postgres)

Local: `backend/migrations/versions/` (app) e `backend/migrations_tenant/versions/` (tenant).

### Convenções

1. **Sempre** usar `UUIDType()`, `JSONType()`, `ArrayAsJSON` em vez de
   `postgresql.UUID(as_uuid=True)` / `postgresql.JSONB()` etc:
   ```python
   from app.db.types import UUIDType, JSONType

   sa.Column("id", UUIDType(), primary_key=True)
   sa.Column("meta", JSONType(), nullable=False)
   ```

2. **Defaults de timestamp**: `sa.text("CURRENT_TIMESTAMP")` (portável),
   não `sa.text("now()")` (PG-only).

3. **`server_default=" "` (espaço)** para strings `nullable=False`
   onde o valor inicial pode ser vazio. Evita que Oracle trate `""` como
   NULL e viole NOT NULL.

4. **Constraints com nome explícito**:
   ```python
   sa.UniqueConstraint("storage_key", name="uq_files_storage_key")
   op.create_foreign_key("fk_photos_file_id_files", "photos", "files", ["file_id"], ["id"])
   ```
   Oracle pré-12c tem limite de 30 chars em identifiers — usar nomes
   curtos e descritivos.

5. **SQL cru só quando necessário**: features PG-only (pgvector, HNSW,
   `unaccent`) devem ser comentadas com `# Postgres-only — Oracle usa
   metadata.create_all`. Ver `t0007_face_embeddings.py` como referência.

### Fluxo de nova migration (app)

```bash
alembic revision -m "descrição"
# edita o arquivo gerado em migrations/versions/
alembic upgrade head
```

### Fluxo de nova migration (tenant)

```bash
alembic -c alembic_tenant.ini -x tenant_schema=mun_5208707 revision -m "descrição"
# edita o arquivo
# aplica em cada tenant
for schema in $(psql -t -A -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'mun_%'"); do
    alembic -c alembic_tenant.ini -x tenant_schema=$schema upgrade head
done
```

---

## Provisionamento (Oracle)

Oracle **não usa Alembic** — as migrations têm SQL PG-específico (SQL cru,
operators, extensões). Em vez disso:

### Schema `app`

`app/db/provisioning.py::provision_app_schema(engine)`:

1. `Base.metadata.create_all(conn)` cria todas as tabelas declaradas nos
   models. `schema_translate_map={"app": None}` converte `schema="app"`
   para o user atual (ex: `APP`).
2. Chama `apply_all_seeds(session)` (ver [seeds](#módulo-de-seeds)).
3. Retorna contadores: `{system_settings: 8, reference_tables: 973, ai_catalog: 15}`.

Pré-requisito: criar o user Oracle antes (DBA):
```sql
CREATE USER APP IDENTIFIED BY "senha";
GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE TO APP;
```

### Schema tenant

`app/db/tenant_schemas.py::ensure_municipality_schema(session, ibge)`:

1. `adapter.create_schema(conn, "mun_5208707")` — em Oracle cria um user
   (equivalente Oracle de schema).
2. Como dialect é `oracle`, chama `_create_tenant_tables_oracle`:
   - `TenantBase.metadata.create_all(conn)` dentro do `CURRENT_SCHEMA` do
     tenant.
   - `CREATE VECTOR INDEX ... NEIGHBOR PARTITIONS` para similarity
     search no `patient_face_embeddings`.

---

## Módulo de seeds

Local: `backend/app/db/seeds/`

Existem 3 arquivos principais, cada um com função `async def apply(session) -> int`:

| Arquivo | Popula | Origem dos dados |
|---|---|---|
| `system_settings.py` | 8 configs (TTL, rate limits, cadsus.base) | Hardcoded Python |
| `reference_tables.py` | 973 rows (nacionalidades, etnias, logradouros, tipos doc, estado civil, escolaridade, religiões, povos, deficiências, parentescos, orientações, identidades, tipos sanguíneos) | `_loader.py` importa das migrations 0012/0013/0014 |
| `ai_catalog.py` | 3 providers, 5 modelos, 4 prompts, 3 rotas globais | Hardcoded Python (subset essencial) |

Todos **idempotentes** — fazem upsert via `adapter.execute_upsert` (PG:
ON CONFLICT, Oracle: MERGE).

### Loader que importa das migrations

Para não duplicar dados entre migrations e seeds, `_loader.py` usa
`importlib` para carregar as listas top-level (`NACIONALIDADES`,
`ETNIAS`, etc.) das migrations Alembic **sem executá-las**:

```python
from app.db.seeds._loader import load_migration_module

m = load_migration_module("20260416_0012_reference_tables.py")
print(len(m.NACIONALIDADES))  # 332
```

### Quando criar novo seed

Sempre que a migration Alembic tiver `op.execute("INSERT ...")`:

1. Mantém o INSERT na migration (para rodar em PG via Alembic).
2. Cria/atualiza função em `app/db/seeds/` que faz o mesmo via
   `adapter.execute_upsert`.
3. Adiciona chamada em `apply_all_seeds`.

---

## Reconhecimento facial (vetor)

### Tabela

`mun_<ibge>.patient_face_embeddings` com `embedding VECTOR(512)`:

- Em Postgres: `vector(512)` (extensão pgvector).
- Em Oracle: `VECTOR(512, FLOAT32)` (AI Vector Search nativo 23ai).

### Índice de similaridade

Criado **fora** do `metadata.create_all` (SQLAlchemy não cria índices
vetoriais automaticamente):

- Postgres: `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
  WITH (m=16, ef_construction=64)` — criado pela migration
  `t0007_face_embeddings.py`.
- Oracle: `CREATE VECTOR INDEX ... ORGANIZATION NEIGHBOR PARTITIONS
  DISTANCE COSINE WITH TARGET ACCURACY 95` — criado pelo
  `_create_tenant_tables_oracle` via `adapter.create_vector_index_sql`.

**Oracle alternativa HNSW**: `ORGANIZATION INMEMORY NEIGHBOR GRAPH`
requer `VECTOR_MEMORY_SIZE` configurado no banco (Oracle Free default =
0). IVF funciona sem config extra.

### Query de similaridade (`face_service.match`)

Gera SQL dialect-aware:

```python
adapter = get_adapter(db.bind.dialect.name)
dist = adapter.vector_cosine_distance_sql("fe.embedding", "q")
# PG: (fe.embedding <=> CAST(:q AS vector))
# Oracle: VECTOR_DISTANCE(fe.embedding, :q, COSINE)

q_param = str(embedding) if dialect == "postgresql" else list(embedding)
# pgvector aceita string, oracledb prefere list → array.array via TypeDecorator
```

---

## Checklist para nova migration

Antes de commitar uma migration nova:

- [ ] Usa `UUIDType()` em vez de `postgresql.UUID(as_uuid=True)`?
- [ ] Usa `JSONType()` em vez de `postgresql.JSONB()`?
- [ ] Usa `ArrayAsJSON(...)` em vez de `postgresql.ARRAY(...)`?
- [ ] `server_default=sa.text("CURRENT_TIMESTAMP")` em timestamps (não `now()`)?
- [ ] `server_default=" "` em strings NOT NULL (não `""`)?
- [ ] `UniqueConstraint`/FK com `name="..."` explícito?
- [ ] Se adiciona dados (seed), tem função equivalente em `app/db/seeds/`?
- [ ] Se usa recurso PG-only (pgvector, GIN, unaccent, extensão), comentado como tal?
- [ ] Testado com `alembic upgrade head` + downgrade?

---

## Checklist para novo model

- [ ] Importa tipos de `app.db.types` (não de `sqlalchemy.dialects.postgresql`)?
- [ ] PK usa `UUIDType()` + `default=new_uuid7`?
- [ ] `server_default=" "` em strings `nullable=False`?
- [ ] Colunas JSON usam `default=list`/`default=dict` (Python-side, não `server_default="[]"`)?
- [ ] FKs usam `name="fk_..."` explícito?
- [ ] `__table_args__` com constraints nomeados?
- [ ] Adicionado ao `app/db/models_registry.py` (app) ou `app/tenant_models/_registry.py` (tenant)?

---

## Gotchas e troubleshooting

### Oracle trata `""` como `NULL`

Tudo que era `server_default=""` em Oracle cria coluna `NOT NULL` sem
default efetivo. Um INSERT que omite essa coluna falha com
`ORA-01400: cannot insert NULL`.

**Solução**: usar `server_default=" "` (um espaço) em colunas `nullable=False`.
Aplicação chama `.strip()` na leitura se precisar.

### `ORA-01484: arrays can only be bound to PL/SQL statements`

Acontece quando passa `list` Python para coluna `VECTOR` ou `JSON` em
`executemany`. O driver oracledb interpreta list como array PL/SQL.

**Solução**: `VectorType.process_bind_param` converte para
`array.array("f", v)`. `JSONType.process_bind_param` serializa com
`json.dumps(v)`. Ambos já tratados.

### `ORA-00932: expression is of data type JSON, which is incompatible with expected data type NATIVE INTEGER`

Acontece em INSERT com RETURNING quando coluna JSON tem `server_default`
(ex: `server_default="[]"`). O driver tenta ler o default como NVARCHAR
mas a coluna é OSON nativo.

**Solução**: em models com coluna JSON NOT NULL, usar `default=list` ou
`default=dict` (Python-side) em vez de `server_default`.

### FK não resolve em metadata após `create_all`

`NoReferencedTableError: Foreign key ... could not find table 'app.xxx'`

Acontece se um model com `ForeignKey("app.xxx.id")` for carregado antes
da tabela `app.xxx` estar na metadata.

**Solução**: garantir que `app/db/models_registry.py` importa **todos**
os models do schema `app` antes de qualquer `create_all` ou query ORM.
O `provisioning.py` já importa o registry.

### Índice vetor HNSW falha em Oracle Free

`ORA-51962: The vector memory area is out of space`

Oracle Free XE tem `VECTOR_MEMORY_SIZE=0`. HNSW `ORGANIZATION INMEMORY`
precisa de memória.

**Solução**: o adapter usa `ORGANIZATION NEIGHBOR PARTITIONS` (IVF) por
default, que não exige memória. Para habilitar HNSW em prod:
```sql
ALTER SYSTEM SET VECTOR_MEMORY_SIZE = 512M SCOPE=SPFILE;
-- restart do banco
```
E trocar o SQL no `oracle.py::create_vector_index_sql` para
`ORGANIZATION INMEMORY NEIGHBOR GRAPH`.

### `schema_translate_map` só aplica em runtime

O `schema_translate_map={"app": None}` só substitui schema no SQL
emitido; **não** muda o metadata Python (onde a tabela continua com
`schema="app"`). Portanto `Base.metadata.tables["app.users"]` continua
sendo a chave correta.

### Seeds rodando no Postgres duplicariam dados

Em Postgres, os seeds rodam **via Alembic** (embutidos nas migrations
0012/0013/0014/etc) — esses seeds são idempotentes (`ON CONFLICT DO
NOTHING`). Os seeds programáticos em `app/db/seeds/` fazem upsert,
também idempotentes. Rodar ambos em Postgres é seguro mas redundante.

**Convenção**: em Postgres, deixar Alembic cuidar. Em Oracle, chamar
`apply_all_seeds` explicitamente via `provision_app_schema`.

---

## Referências no código

- Tipos: `backend/app/db/types.py`
- Adapter: `backend/app/db/dialect/{base,postgresql,oracle}.py`
- Provisionamento: `backend/app/db/provisioning.py`, `tenant_schemas.py`
- Seeds: `backend/app/db/seeds/`
- Face service (usa adapter vetor): `backend/app/modules/hsp/face_service.py`
- Models registry: `backend/app/db/models_registry.py`, `backend/app/tenant_models/_registry.py`
