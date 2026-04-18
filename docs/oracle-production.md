# Runbook — Produção em Oracle

Playbook operacional para provisionar, evoluir e operar o zSaúde em
Oracle Database 23ai. Complementa o [`database-portability.md`](./database-portability.md)
(conceitual) e o [`database-patterns.md`](./database-patterns.md) (padrões de código).

## Pré-requisitos do DBA

```sql
-- 1. Usuário admin (APP) — conecta a app no schema lógico "app"
CREATE USER APP IDENTIFIED BY <senha>
    DEFAULT TABLESPACE users
    QUOTA UNLIMITED ON users;

GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE TO APP;

-- Pro provisioning de novos tenants, APP precisa criar users + escrever
-- em tabelas de outros schemas (para cadastros cross-tenant):
GRANT CREATE USER, ALTER USER, DROP USER TO APP;
GRANT CREATE ANY TABLE, ALTER ANY TABLE, DROP ANY TABLE,
      INSERT ANY TABLE, UPDATE ANY TABLE, DELETE ANY TABLE, SELECT ANY TABLE
      TO APP;

-- 2. (Opcional) Package para Application Context — auditoria cross-session
--    Sem isso os logs de auditoria ficam sem user_id/municipality_id na
--    sessão; o app continua funcional, só perde esse contexto.
CREATE PACKAGE ZSAUDE.ZSAUDE_CTX_PKG AS
    PROCEDURE set_val(k VARCHAR2, v VARCHAR2);
END;
/
CREATE PACKAGE BODY ZSAUDE.ZSAUDE_CTX_PKG AS
    PROCEDURE set_val(k VARCHAR2, v VARCHAR2) IS
    BEGIN
        DBMS_SESSION.SET_CONTEXT('ZSAUDE_CTX', k, v);
    END;
END;
/
```

## Primeira inicialização (bootstrap)

```bash
# .env
DATABASE_URL=oracle+oracledb://app:<senha>@host:1521/?service_name=<pdb>

# Provisiona schema app + 3 seeds idempotentes
python -c "
import asyncio
from app.db.session import engine
from app.db.provisioning import provision_app_schema

async def main():
    result = await provision_app_schema(engine(), apply_seeds=True)
    print(result)

asyncio.run(main())
"
```

Esperado ao fim: `{'dialect': 'oracle', 'system_settings': 8,
'reference_tables': 973, 'ai_catalog': 15+, 'fingerprint': '...'}`.

Ver registro gravado:

```sql
SELECT id, fingerprint, table_count, applied_at FROM APP.SCHEMA_VERSION;
```

## Adicionar novo município (tenant)

Via API (prefere):

```http
POST /api/v1/admin/municipalities
{
  "name": "Cidade X",
  "ibge": "5205109",
  "state": "GO"
}
```

Internamente chama `ensure_municipality_schema(..., ibge, apply_migrations=True)`:

1. `APP` faz `CREATE USER MUN_<ibge>` + grants.
2. Conecta **como o próprio user tenant** (não como APP) para que o DDL
   crie tabelas com `owner = MUN_<ibge>`.
3. `TenantBase.metadata.create_all` cria todas as 18 tabelas tenant.
4. Cria índice `VECTOR INDEX ix_pfe_embedding_hnsw` (AI Vector Search).
5. Registra em `APP.SCHEMA_VERSION` como `id = 'mun_<ibge>'`.

Listar tenants provisionados:

```sql
SELECT id, table_count, applied_at
  FROM APP.SCHEMA_VERSION
 WHERE id LIKE 'mun_%'
 ORDER BY applied_at DESC;
```

## Evolução de schema (nova coluna nos models)

Quando um model ganha coluna nova:

### Postgres (dev)

```bash
alembic revision --autogenerate -m "add patients.nova_col"
# edita o arquivo se precisar
alembic upgrade head
```

### Oracle (prod)

1. Recria o container app com a nova imagem (models atualizados).
2. Rodar o provision novamente:

```python
await provision_app_schema(engine(), apply_seeds=True, auto_evolve=True)
```

O `auto_evolve=True` (padrão) aciona o **schema migrator** que:
- Lê colunas atuais de `user_tab_columns`.
- Compara com `Base.metadata`.
- Aplica `ALTER TABLE ADD (<nova_col>)` pra cada coluna que falta.
- Log estruturado `schema_add_column` pra cada ALTER.

Retorna `{..., 'added_columns': ['app.PATIENTS.NOVA_COL'], ...}`.

Para tenants, mesmo fluxo:

```python
await ensure_municipality_schema(session, ibge, apply_migrations=True)
```

O `_do_create` detecta que já existe, chama `evolve_schema` e aplica diffs.

### Limitações do auto-evolve

- **ADD COLUMN**: ✅ suportado.
- **DROP COLUMN**: ⚠️ opcional (`allow_drop=True` destrutivo, DBA-ok).
- **MODIFY COLUMN** (tipo/nullable): ❌ manual via DBA. O migrator não
  tenta — risco de perda de dado em mudanças incompatíveis.

Para mudar tipo de coluna em prod, DBA executa `ALTER TABLE X MODIFY (...)`
antes do deploy do app.

## Dry-run (preview sem aplicar)

```python
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.schema_migrator import evolve_schema
from app.db.base import Base
from app.db.session import engine

eng = engine().execution_options(schema_translate_map={"app": None})
async with eng.begin() as conn:
    result = await conn.run_sync(lambda c: evolve_schema(
        c, Base.metadata,
        schema_translate={"app": None},
        dry_run=True,
    ))
print(result.skipped)   # lista de DDLs que SERIAM aplicados
```

## Rollback

Oracle **não** tem `alembic downgrade`. Estratégias:

### a) Rollback de dado (transação)

Para operações normais, o pool do SQLAlchemy faz rollback automático se
a transação não commitar. Nenhuma ação necessária.

### b) Rollback de schema (após ADD COLUMN acidental)

```sql
ALTER TABLE <TABELA> DROP COLUMN <COLUNA>;
```

Depois sincronizar com os models e rodar provision novamente.

### c) Rollback completo (drop + re-bootstrap)

⚠️ **Perde todos os dados**.

```sql
DROP USER APP CASCADE;
-- recriar conforme "Pré-requisitos do DBA" + provisionar de novo
```

Backup prévio é responsabilidade do DBA — use RMAN / Data Pump.

## Monitoramento e telemetria

Logs estruturados emitidos (JSON via structlog):

- `app_schema_created` — fim do provision, com `duration_ms`
- `seed_applied` — por seed, com `name`, `rows`, `duration_ms`
- `seeds_applied_all` — resumo final com counts por seed
- `schema_add_column` — para cada ALTER aplicado
- `schema_drop_column` — warning nível
- `tenant_tables_created_oracle` / `tenant_schema_evolved`
- `schema_version_recorded` — fingerprint + table_count

Dashboard de saúde (queries úteis):

```sql
-- Schemas provisionados e última atualização
SELECT id, fingerprint, table_count, applied_at
  FROM APP.SCHEMA_VERSION ORDER BY applied_at DESC;

-- Tamanho de segmento por tabela do app
SELECT segment_name, bytes/1024/1024 AS mb
  FROM dba_segments
 WHERE owner = 'APP' AND segment_type = 'TABLE'
 ORDER BY bytes DESC FETCH FIRST 20 ROWS ONLY;

-- Índices vetoriais (AI Vector Search)
SELECT owner, table_name, index_name, index_type
  FROM all_indexes
 WHERE index_type = 'VECTOR' ORDER BY owner;
```

## Testes automatizados (CI)

Os testes de paridade ficam em `backend/tests/test_db_parity.py`. Rodar:

```bash
# Só PG (default, rápido)
uv run pytest tests/test_db_parity.py

# PG + Oracle (sobe container Oracle ~2min)
backend/scripts/test_oracle.sh

# Só os testes Oracle
backend/scripts/test_oracle.sh -k oracle
```

Em CI (GitHub Actions / GitLab):

```yaml
- name: Parity tests (PG + Oracle)
  env:
    ORACLE_TEST: "1"
  run: uv run pytest tests/test_db_parity.py
```

Tempo: ~2-3 min (a maior parte é pull da imagem Oracle, cacheada entre builds).

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `ORA-01045: user APP does not have CREATE SESSION privilege` | User criado sem `CONNECT` | Ver pré-requisitos DBA, re-grant |
| `ORA-01031: insufficient privileges` ao criar tenant | Faltam grants tipo `CREATE USER` no APP | Grants do "Pré-requisitos DBA" |
| `ORA-51962: vector memory area out of space` | HNSW requer `VECTOR_MEMORY_SIZE` | Ou usar IVF (padrão) ou `ALTER SYSTEM SET VECTOR_MEMORY_SIZE=512M SCOPE=SPFILE; restart` |
| Provision roda mas tabelas não aparecem | Connected como user errado | Checar `SELECT USER FROM DUAL` — precisa ser `APP` |
| Seeds não atualizam dados | Seeds são idempotentes (upsert) | Deleta manualmente e re-provisiona, ou edita o valor via UI |
| `schema_version` vazio depois de provision | user não tem permissão em `APP.SCHEMA_VERSION` | Provisionar como APP (não como tenant) |

Mais padrões de erro em `docs/database-patterns.md` (seção "Índice de
referência rápida").

## Backup recomendado

- **Data Pump diário** (`expdp APP/... dumpfile=app_YYYYMMDD.dmp`)
- **Flashback Database** habilitado para janela de 24h
- **RMAN** incremental para retenção maior

Script sugerido (`backend/scripts/backup_oracle.sh`) — não incluído, mas o
DBA deve configurar conforme a política da organização.
