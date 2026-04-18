# Padrões de código Postgres + Oracle

Guia **prático** para escrever código que funciona nos dois bancos. Foca
em **armadilhas reais** que já aconteceram e em como evitá-las. Complementar
ao [`database-portability.md`](./database-portability.md) (que descreve a
infra de tipos e adapter).

> **Regra de ouro**: se der pra fazer via ORM (`session.add`, `select`,
> `update`), faça. Se precisar de `text()` cru, **use o adapter** para
> expressões dialect-specific e converta tipos Python antes do bind.

---

## Sumário

1. [Escolhendo o caminho](#escolhendo-o-caminho)
2. [INSERT/UPDATE via ORM](#1-insertupdate-via-orm)
3. [SELECT via ORM com agregações](#2-select-via-orm-com-agregações)
4. [SELECT com `text()` cru](#3-select-com-text-cru)
5. [Upsert / MERGE](#4-upsert--merge)
6. [Busca por similaridade de vetor](#5-busca-por-similaridade-de-vetor)
7. [Seeds e dados de referência](#6-seeds-e-dados-de-referência)
8. [Armadilhas específicas do Oracle](#armadilhas-específicas-do-oracle)
9. [Checklist antes de PR](#checklist-antes-de-pr)

---

## Escolhendo o caminho

| Caso | Como fazer |
|---|---|
| CRUD simples de uma tabela | ORM: `session.add`, `select`, `update` |
| Upsert (insert-or-update) | `adapter.execute_upsert(session, Model, values, ...)` |
| Agregação com `SUM`/`COUNT` | ORM + `func` (evite `func.date_trunc`, `.filter(...)`) |
| Busca vetorial | `adapter.vector_cosine_distance_sql(col, param)` |
| Texto com acento/case | `adapter.unaccent_upper_expr(col)` |
| Bulk insert (>100 linhas) | `session.execute(insert(T), rows)` |
| Seed / bootstrap | `adapter.execute_upsert` com `index_elements=["unique_col"]` |

---

## 1. INSERT/UPDATE via ORM

**Funciona igual em ambos os bancos**, sem gambiarra. Dispara os hooks
`before_insert`/`before_update` que aplicam a compat Oracle automaticamente.

```python
async with AsyncSession(engine) as s:
    patient = Patient(prontuario="P001", name="Alice", birth_date=date(1990, 1, 1))
    s.add(patient)
    await s.commit()
```

### Hooks automáticos em Oracle

Se o model tem `String NOT NULL`, o hook converte `""` → `" "` antes do
INSERT (Oracle trata `""` como `NULL`). Ver
`app/db/base.py::_register_oracle_null_fix`.

---

## 2. SELECT via ORM com agregações

Use `func` e expressões SQLAlchemy — **não** escreva SQL cru para agregações
simples.

### ❌ Armadilhas

```python
# PG-only: date_trunc não existe em Oracle (ORA-00904)
func.date_trunc("day", AIUsageLog.at)

# PG-only: FILTER (WHERE) não existe em Oracle
func.count().filter(AIUsageLog.success == True)
```

### ✅ Padrões portáveis

**Agrupamento temporal**:

```python
from sqlalchemy import case, func

is_oracle = session.bind.dialect.name == "oracle"
if is_oracle:
    # TRUNC(col, 'DD') = início do dia, 'IW' = início da semana ISO
    bucket = func.trunc(AIUsageLog.at, "IW" if group == "week" else "DD")
else:
    bucket = func.date_trunc(group, AIUsageLog.at)
```

**Contagem condicional** (em vez de `FILTER`):

```python
# Portável PG + Oracle
successes = func.coalesce(
    func.sum(case((AIUsageLog.success == True, 1), else_=0)), 0
)
```

**Exemplo completo** (`app/modules/ai/router.py::sys_usage_timeseries`):

```python
stmt = (
    select(
        bucket.label("bucket"),
        func.count().label("requests"),
        func.coalesce(func.sum(AIUsageLog.tokens_in), 0).label("tokens_in"),
        successes.label("successes"),
    )
    .group_by("bucket")
    .order_by("bucket")
)
```

---

## 3. SELECT com `text()` cru

Quando precisa de SQL cru — lembrar que **tipos não passam por TypeDecorator**.
Em Oracle, o driver devolve:
- `UUID` (PG) → `uuid.UUID` | `RAW(16)` (Oracle) → `bytes`
- `JSONB` (PG) → `dict`/`list` | `JSON` (Oracle) → pode vir como `Decimal`,
  `int`, `str` JSON ou dict
- `vector` (PG) → `list[float]` | `VECTOR` (Oracle) → `array.array("f", ...)`

### ❌ Armadilha real (bug deste projeto)

```python
# repository.py::bulk_modules_by_user — ORA retorna bytes, lookup com UUID falha
rows = await session.execute(text(sql), params)
out: dict[UUID, set[str]] = {uid: set() for uid in user_ids}
for uid, module in rows:
    out[uid].add(module)   # KeyError: b'\xc5\x12ay...'  (uid veio como bytes)
```

### ✅ Padrão

```python
for uid, module in rows:
    # RAW(16) do Oracle → UUID
    if isinstance(uid, bytes):
        uid = UUID(bytes=uid)
    out[uid].add(module)
```

### Regras para `text()` cru

1. **UUID vindo do SELECT**: sempre checar `isinstance(value, bytes)` e
   converter.
2. **Bind de UUID**: em Oracle passar `uuid.UUID.bytes`, em PG passar o
   `uuid.UUID` direto. Ou usar `adapter.execute_upsert` que trata.
3. **Palavras reservadas** (`level`, `resource`, `order`, `group`, `date`,
   `user`, `session`, `size`...): em Oracle, quotar em minúsculas:

   ```python
   # ❌ ORA-01788: CONNECT BY clause required
   text("SELECT login FROM users WHERE level = 'master'")

   # ✅
   text('SELECT login FROM users WHERE "level" = :l').bindparams(l="master")
   ```

4. **`LIMIT N`** (PG) → **`FETCH FIRST N ROWS ONLY`** (Oracle). Ambos
   funcionam em PG 8.4+ e Oracle 12c+:

   ```python
   # Portável
   text("SELECT ... FETCH FIRST :n ROWS ONLY").bindparams(n=10)
   ```

5. **Booleans**:
   - PG: `WHERE active IS TRUE` ou `active = true`
   - Oracle: `WHERE active = 1` (coluna é `NUMBER(1)`)
   - **Portável via ORM**: `.where(Model.active.is_(True))` é traduzido
     pelo dialect.

---

## 4. Upsert / MERGE

Sempre via adapter. **Nunca** monte `INSERT ... ON CONFLICT` manualmente.

```python
from app.db.dialect import get_adapter

adapter = get_adapter(session.bind.dialect.name)
await adapter.execute_upsert(
    session,
    Patient,
    values=[{"prontuario": "P001", "name": "Alice", ...}, ...],
    index_elements=["prontuario"],     # coluna do ON CONFLICT / MERGE ON
    update_columns=["name", "birth_date"],
    extra_set={"updated_at": datetime.now(UTC)},  # opcional
)
```

O adapter cuida de:
- PG: `INSERT ... ON CONFLICT ... DO UPDATE SET ...`
- Oracle: `MERGE INTO ... USING (SELECT ... FROM dual) src ON (...) WHEN MATCHED / WHEN NOT MATCHED INSERT ...`
- **Oracle extra**: aplica `default=callable` Python-side (`default=new_uuid7`)
  para colunas ausentes, converte `uuid.UUID → bytes`, `dict/list → json.dumps`,
  `list[float] → array.array("f", ...)`, `bool → 0/1`.

### `extra_set` — valores computados no UPDATE

```python
extra_set={
    "updated_at": datetime.now(UTC),   # → TIMESTAMP 'YYYY-MM-DD HH:MM:SS.ffffff'
    "last_editor": "system",           # → 'system'
    "is_active": True,                 # → 1
}
```

---

## 5. Busca por similaridade de vetor

**Sempre via adapter** — os operators diferem:
- PG: `col <=> CAST(:q AS vector)` (pgvector)
- Oracle: `VECTOR_DISTANCE(col, :q, COSINE)` (AI Vector Search 23ai)

### ❌ SQL cru com operator hardcoded quebra em Oracle

```python
text("SELECT ... WHERE embedding <=> CAST(:q AS vector) <= :max_dist ORDER BY embedding <=> CAST(:q AS vector)")
```

### ✅ Via adapter

```python
adapter = get_adapter(session.bind.dialect.name)
dist = adapter.vector_cosine_distance_sql("fe.embedding", "q")
dialect = session.bind.dialect.name

sql = f"""
    SELECT p.name, 1 - ({dist}) AS similarity
    FROM patient_face_embeddings fe
    JOIN patients p ON p.id = fe.patient_id
    WHERE ({dist}) <= :max_dist
    ORDER BY ({dist}) ASC
    FETCH FIRST :lim ROWS ONLY
"""
```

### Bind do vetor (diferente por banco!)

```python
import array

if dialect == "postgresql":
    q_param = str(embedding)          # pgvector aceita string serializada
else:
    q_param = array.array("f", embedding)   # oracledb exige array C-style
```

**Não** passar `list[float]` em Oracle — dispara `ORA-01484: arrays can
only be bound to PL/SQL statements`.

---

## 6. Seeds e dados de referência

Em **PG**, seeds vivem nas migrations Alembic (`migrations/versions/`).
Em **Oracle**, rodam via `app/db/seeds/` (invocados por `provision_app_schema`).

### Estrutura idempotente

```python
# app/db/seeds/meu_seed.py
from app.db.dialect import get_adapter
from app.db.types import new_uuid7
from app.models.foo import Foo

async def apply(session) -> int:
    adapter = get_adapter(session.bind.dialect.name)
    values = [
        {"id": new_uuid7(), "codigo": "A", "descricao": "Alpha"},
        {"id": new_uuid7(), "codigo": "B", "descricao": "Beta"},
    ]
    await adapter.execute_upsert(
        session, Foo, values,
        index_elements=["codigo"],
        update_columns=["descricao"],
    )
    return len(values)
```

Depois, registrar em `app/db/seeds/__init__.py::apply_all_seeds`.

### Reaproveitando dados de migrations

Se os dados **já estão** numa migration Alembic (lista top-level tipo
`ETNIAS: list[tuple]`), importe direto via `_loader` pra não duplicar:

```python
from app.db.seeds._loader import load_migration_module

m = load_migration_module("20260416_0013_seed_etnias.py")
# agora m.ETNIAS tem os 406 registros
```

---

## Armadilhas específicas do Oracle

Lista dos bugs reais que já apareceram. Se aparecer erro parecido, consultar
aqui primeiro.

### `""` vira `NULL` em Oracle

Coluna `String NOT NULL` com `server_default=""` **quebra** em Oracle
(viola `NOT NULL`).

- **Migrations/models**: use `server_default=" "` (um espaço) ou nenhum
  default (campo opcional via `nullable=True`).
- **Runtime**: o hook `_register_oracle_null_fix` converte `""` → `" "` nos
  INSERTs via ORM automaticamente. **Mas** se gravar via `text(INSERT ...)`
  cru, o hook não dispara — passe `" "` manualmente.

### Default Python (`default=new_uuid7`) em MERGE cru

Em `session.add(Model(...))`, o `default=new_uuid7` dispara client-side.
Mas em `text("INSERT/MERGE ...")` raw, **não dispara** — o Oracle recebe
`id = NULL` e quebra (`ORA-01400`).

- **Solução**: use `adapter.execute_upsert` — tem `_apply_python_defaults`
  que chama `new_uuid7()` para colunas NOT NULL ausentes.

### JSON `server_default="[]"` quebra RETURNING no Oracle

```python
# ❌ bug em Oracle (DDL cria DEFAULT '[]' que quebra no RETURNING)
my_json: Mapped[list] = mapped_column(JSONType(), nullable=False, server_default="[]")

# ✅ default Python-side, aplicado no INSERT via ORM
my_json: Mapped[list] = mapped_column(JSONType(), nullable=False, default=list)
```

### `list` Python para coluna `VECTOR`/`JSON`

Oracle `oracledb` driver interpreta `list` como array PL/SQL → `ORA-01484`.

- **VECTOR**: passar `array.array("f", vec)`
- **JSON**: passar `json.dumps(dict_or_list)` ou deixar o `JSONType` cuidar
  (só funciona via ORM, não em `text()` cru)
- **Via adapter**: `_coerce_value_for_oracle` já trata ambos.

### `UUID` em SELECT raw vem como `bytes`

Sempre converter ao ler:

```python
if isinstance(uid, bytes):
    uid = UUID(bytes=uid)
```

### Palavras reservadas (`level`, `user`, `date`, `session`...)

Quotar em **minúsculas** em Oracle:

```python
text('SELECT "level" FROM users')
```

Ou renomear a coluna no model para evitar o reservado.

### Package `ZSAUDE.ZSAUDE_CTX_PKG` ausente em dev

`OracleAdapter.set_session_vars` e `_set_tenant_context_oracle` silenciam
`ORA-06550`/`ORA-04063` para dev. Em produção o DBA precisa instalar o
package — o auditlog fica sem contexto se ele faltar.

### FK cross-schema durante `create_all`

`ALTER SESSION SET CURRENT_SCHEMA = MUN_XXX` muda o **schema default** de
resolução, mas o DDL continua criando tabelas com `owner = user_logado`.
Para provisionar tenant Oracle corretamente, **conectar como o próprio
tenant** (ver `_create_tenant_tables_oracle`).

### Grants mínimos pro tenant user em Oracle

```sql
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW,
      CREATE PROCEDURE, UNLIMITED TABLESPACE TO MUN_XXX;
```

`CREATE INDEX` **não** é system priv — tirar do grant (aparece como
`ORA-00990`).

### Datetime com timezone em `extra_set`

Oracle não aceita interpolação direta de datetime (o `:` do timezone
quebra o parser de bind). Use o `adapter.execute_upsert` — ele serializa
como `TIMESTAMP 'yyyy-mm-dd hh:mm:ss.ffffff'`.

---

## Checklist antes de PR

Antes de commit de código que mexe no banco:

- [ ] Usei ORM sempre que possível? (evita maior parte dos bugs)
- [ ] Se `text()` cru: converti `bytes → UUID` ao ler SELECT?
- [ ] Se `text()` cru com UUID no WHERE: bindei corretamente por dialect?
- [ ] Palavras reservadas Oracle (`level`, `user`, `date`, etc) quotadas?
- [ ] `LIMIT` trocado por `FETCH FIRST N ROWS ONLY`?
- [ ] `date_trunc`/`FILTER`/operators PG-only substituídos?
- [ ] Se adicionei coluna `String NOT NULL`: tem `server_default=" "` ou é opcional?
- [ ] Se adicionei coluna `JSON NOT NULL`: usei `default=list`/`default=dict`
      Python-side (não `server_default`)?
- [ ] Se é seed novo: virou função em `app/db/seeds/`?
- [ ] Testei em **ambos** os bancos? (seeds em PG funciona sozinho; em Oracle,
      validar no `provision_app_schema`)

---

## Quando criar uma abstração nova

Se precisar de uma função/operator que varia entre PG e Oracle:

1. **Adiciona método abstrato** em `app/db/dialect/base.py::DialectAdapter`
2. **Implementa** em `postgresql.py` e `oracle.py`
3. **Exporta** pelo `get_adapter(dialect_name)`
4. **Chama no código** sem `if dialect ==`:

   ```python
   sql_expr = adapter.minha_funcao_portavel(col, arg)
   ```

Exemplos existentes:
- `vector_cosine_distance_sql` — PG `<=>` / Oracle `VECTOR_DISTANCE`
- `create_vector_index_sql` — HNSW vs IVF
- `unaccent_upper_expr` — `UPPER(unaccent(col))` vs `NLS_UPPER(col, 'NLS_SORT=BINARY_AI')`
- `func_gen_uuid_sql` — `gen_random_uuid()` vs `SYS_GUID()`

---

## Índice de referência rápida

| Sintoma (erro Oracle) | Causa provável | Solução |
|---|---|---|
| `ORA-01400: cannot insert NULL into ...` | `""` em string NOT NULL ou default Python não dispara | Hook `before_insert` (ORM) ou `adapter.execute_upsert` |
| `ORA-01484: arrays can only be bound to PL/SQL statements` | `list` Python em coluna VECTOR/JSON | `array.array("f", ...)` ou `json.dumps(...)` |
| `ORA-00904: "X": invalid identifier` | Função PG-only (`date_trunc`, etc) | Usar `func.trunc(...)` ou ver adapter |
| `ORA-01788: CONNECT BY clause required` | Palavra reservada não quotada (`level`, `user`, `date`) | Quotar em minúsculas: `"level"` |
| `ORA-00990: missing or invalid privilege` | Grant de priv que não existe | Remover do GRANT (ex: `CREATE INDEX`) |
| `ORA-06550 / ORA-04063` | Package PL/SQL ausente | OK em dev (silenciado); prod requer package |
| `DPY-4010: bind variable ... not provided` | Interpolação literal quebrou o parser | Usar `adapter.execute_upsert` |
| `DPY-3002: Python value of type "X" is not supported` | Tipo Python não mapeia direto (ex: `uuid.UUID`) | `adapter._coerce_value_for_oracle` |
| `ORA-00932: data type JSON incompatible with X` | `server_default=...` em coluna JSON | `default=list`/`default=dict` Python-side |
| `KeyError: b'...'` | SELECT raw retornou `bytes` (RAW(16)) | `UUID(bytes=val)` ao iterar |
