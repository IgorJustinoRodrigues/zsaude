# Multi-tenant — schema por município

## Modelo de isolamento

Um banco Postgres, vários schemas:

| Schema | Conteúdo |
|---|---|
| `app` | identidade, diretório, auditoria, RBAC, configurações. **Compartilhado**. |
| `mun_<ibge>` | tudo que é operacional do município (pacientes, atendimentos, exames...). **Um por município**. |
| `public` | só `alembic_version` do ambiente `app`. |

`<ibge>` é o código IBGE do município (6–7 dígitos). Ex.: Goiânia = `mun_5208707`.

**Por que schema-por-município e não banco-por-município?** Um banco facilita backup, conexão pool, queries cross-tenant quando precisar (MASTER), e o overhead de criar schema é barato. Isolamento via `search_path` é suficiente para a escala de municípios.

**Por que não RLS row-level?** Foi descartado porque a chance de vazar entre municípios por esquecer de aplicar filtro é maior que a chance de falhar em setar search_path (que vem do middleware, não do código da query).

## search_path por transação

Cada request traz um token de contexto (`X-Work-Context`) com `municipality_ibge`. Em `app/db/session.py`, um listener do SQLAlchemy emite antes de cada transação:

```sql
SET LOCAL search_path = "mun_5208707", "app", "public"
```

Resultado:

- `SELECT * FROM patients` resolve em `mun_5208707.patients`.
- `SELECT * FROM users` resolve em `app.users` (cai no próximo schema do path).
- Sem contexto, o path vira `"app", "public"` (endpoints de admin MASTER).

## Tabelas compartilhadas vs per-município

Use a árvore para decidir onde mora uma tabela nova:

```
A informação é sobre um município específico?
├─ Sim  → tenant_models/ + migrations_tenant
└─ Não  → modules/<nome>/models.py + migrations/
```

Exemplos:

| Tabela | Schema | Motivo |
|---|---|---|
| `users` | `app` | um login serve múltiplos municípios |
| `municipalities` | `app` | a própria lista de municípios |
| `audit_logs` | `app` | auditoria global (inclusive ações MASTER) |
| `patients` | `mun_<ibge>` | paciente pertence ao município |
| `appointments` | `mun_<ibge>` | agendamento local |
| `facility_accesses` | `app` | vincula user ↔ unidade; unidade pertence a município mas a relação é de identidade |

**Regra prática**: se MASTER precisa listar globalmente, vai em `app`. Se o dado é visto só por quem está dentro do contexto do município, vai em `mun_<ibge>`.

## Bases declarativas

Duas bases — a metadata delas é separada para as migrations não se misturarem.

```python
# app/db/base.py  — tabelas compartilhadas
class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=..., schema="app")

# app/tenant_models/__init__.py  — tabelas per-município
class TenantBase(DeclarativeBase):
    metadata = MetaData(naming_convention=...)   # sem schema
```

`TenantBase` **não fixa schema**: o `search_path` da conexão decide em qual schema a tabela é criada.

## Provisionamento de município

Quando um MASTER cria um município (`POST /api/v1/admin/municipalities`), o backend:

1. Insere linha em `app.municipalities`.
2. Executa `ensure_municipality_schema(session, ibge)` — cria o schema e roda as tenant migrations (Alembic `upgrade head`).
3. Commita.

Operação é idempotente: recriar um município com mesmo IBGE não duplica nem reaplica migrations já feitas.

Código em `app/db/tenant_schemas.py`:

```python
async def ensure_municipality_schema(session, ibge, *, apply_migrations=True) -> str:
    name = schema_for_municipality(ibge)
    await session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{name}"'))
    await session.commit()  # Alembic abre conexão nova; precisa do commit antes
    if apply_migrations:
        await apply_tenant_migrations(name)
    return name
```

## Rastreio de versão por schema

Cada `mun_<ibge>` tem sua própria tabela `alembic_version`. Isso é feito via `version_table_schema=schema` em `migrations_tenant/env.py`. Benefício: um município pode estar em versão diferente durante um deploy parcial.

## Referências cross-schema

FKs entre schemas são **desencorajadas**. Preferimos guardar um UUID "informativo" e manter consistência na aplicação:

```python
# em patients (mun_<ibge>)
created_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID, nullable=True)
# NÃO declara ForeignKey("app.users.id") — cross-schema
```

Motivo: facilita backup/restore de município isolado, evita deadlock em DDL cross-schema.

## Veja também

- [Migrations](./migrations.md) — como criar e rodar.
- [Criar tabelas](./creating-tables.md) — passo a passo.
