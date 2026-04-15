# Criar tabelas

Duas escolhas antes de começar:

1. A tabela é **compartilhada** (identidade, auditoria, catálogos globais) ou **por município** (dados operacionais)?
2. Se for por município, ela é acessível por todos os módulos do município ou só um?

A regra curta: *"MASTER precisa listar globalmente?"* → `app`. Senão → `mun_<ibge>`.

## Caminho A — tabela compartilhada (schema `app`)

Exemplo: criar `contact_types` (catálogo global de tipos de contato).

### 1. Modelo

`app/modules/contacts/models.py`:

```python
from __future__ import annotations

import uuid
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String

from app.db.base import Base, TimestampedMixin
from app.db.types import new_uuid7


class ContactType(Base, TimestampedMixin):
    __tablename__ = "contact_types"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
```

### 2. Registrar no registry

`app/db/models_registry.py`:

```python
from app.modules.contacts.models import ContactType  # noqa: F401
```

Alembic só descobre modelos que estão importados quando o env.py roda.

### 3. Autogenerate

```bash
docker compose exec app alembic revision --autogenerate -m "add contact_types"
```

Revise o arquivo em `migrations/versions/`. Remova o que não for seu (o autogenerate às vezes propõe mudanças de naming em tabelas pré-existentes).

### 4. Aplicar

```bash
docker compose exec app alembic upgrade head
```

## Caminho B — tabela por município (schema `mun_<ibge>`)

Exemplo: criar `appointments` (agendamentos do município).

### 1. Modelo

`app/tenant_models/appointments.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import DateTime, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import new_uuid7
from app.tenant_models import TenantBase


class Appointment(TenantBase):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    patient_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="agendado")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
```

Pontos importantes:

- Herda de **`TenantBase`**, não de `Base`.
- **Não** declare `__table_args__ = {"schema": "..."}`. O `search_path` resolve em runtime.
- FK para `patients` (mesmo schema) **pode** ser declarada com `ForeignKey("patients.id")`.
- FK para `app.users` (schema diferente) é **desencorajada**: guarde só o UUID.

### 2. Registrar no registry tenant

`app/tenant_models/_registry.py`:

```python
from app.tenant_models.patients import Patient          # noqa: F401
from app.tenant_models.appointments import Appointment  # noqa: F401
```

### 3. Autogenerate (contra um schema existente)

Alembic precisa comparar com um schema real. Use qualquer `mun_<ibge>` já aplicado:

```bash
docker compose exec -e ALEMBIC_TENANT_SCHEMA=mun_5208707 app \
  alembic -c alembic_tenant.ini revision --autogenerate -m "add appointments"
```

Revise o arquivo em `migrations_tenant/versions/<id>_add_appointments.py`. Confira que **nenhum `op.create_table`/`op.create_index` traz `schema=`**.

### 4. Aplicar em todos os municípios

```bash
docker compose exec app python -m scripts.migrate_tenants
```

Pronto: cada `mun_<ibge>` agora tem a tabela `appointments`.

## Checklist antes do commit

- [ ] Modelo herda da base correta (`Base` para `app`, `TenantBase` para tenant)
- [ ] Import adicionado no registry correto
- [ ] Arquivo de migration criado em `migrations/` ou `migrations_tenant/`
- [ ] Migration revisada (nada sobrando, nada com `schema=` em tenant)
- [ ] Aplicado localmente com sucesso
- [ ] Tabela criada com o nome e colunas esperados (confira no `docker compose exec postgres psql`)

## Confirmando no Postgres

```bash
docker compose exec postgres psql -U zsaude -d zsaude

-- Listar tabelas em app
\dt app.*

-- Listar tabelas num município
\dt mun_5208707.*

-- Ver versão Alembic do tenant
SELECT * FROM mun_5208707.alembic_version;
```
