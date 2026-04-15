# Criar um novo endpoint

Caminho típico: **schema → repository → service → router → v1**.

Exemplo: listar pacientes ativos do município do contexto.

## 1. Schema (Pydantic)

`app/modules/patients/schemas.py`:

```python
from datetime import date
from uuid import UUID
from app.core.schema_base import BaseSchema


class PatientOut(BaseSchema):
    id: UUID
    prontuario: str
    name: str
    cpf: str
    birth_date: date | None = None
    active: bool
```

`BaseSchema` já traz `alias_generator=to_camel` e `populate_by_name=True`, então o JSON sai camelCase automaticamente (`birthDate` etc.).

## 2. Repository

`app/modules/patients/repository.py`:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.tenant_models.patients import Patient


class PatientRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_active(self, *, limit: int = 50) -> list[Patient]:
        stmt = select(Patient).where(Patient.active.is_(True)).order_by(Patient.name).limit(limit)
        return list((await self.db.scalars(stmt)).all())
```

Não precisa qualificar schema — o `search_path` já está em `mun_<ibge>, app, public` (setado no listener de sessão).

## 3. Service

`app/modules/patients/service.py`:

```python
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.patients.repository import PatientRepository
from app.modules.patients.schemas import PatientOut


class PatientService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = PatientRepository(db)

    async def list_active(self) -> list[PatientOut]:
        rows = await self.repo.list_active()
        return [PatientOut.model_validate(r, from_attributes=True) for r in rows]
```

Se o endpoint muta algo, é aqui que entra `write_audit(...)` (veja [audit-and-sessions](./audit-and-sessions.md)).

## 4. Router

`app/modules/patients/router.py`:

```python
from fastapi import APIRouter

from app.core.deps import DB, CurrentContextDep, requires
from app.modules.patients.schemas import PatientOut
from app.modules.patients.service import PatientService

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientOut])
async def list_active(
    db: DB,
    ctx: CurrentContextDep = requires(module="cln"),
) -> list[PatientOut]:
    return await PatientService(db).list_active()
```

Dependências em jogo:

- `DB` — sessão async por request (commit automático).
- `CurrentContextDep` — exige header `X-Work-Context` válido; seta audit e search_path do município.
- `requires(module="cln")` — impede acesso se o contexto não tem o módulo CLN.

Para endpoints MASTER (sem contexto de município), use `MasterDep`:

```python
from app.core.deps import DB, MasterDep

@router.get("/admin/stats")
async def stats(user: MasterDep, db: DB): ...
```

## 5. Registrar no agregador v1

`app/api/v1.py`:

```python
from app.modules.patients.router import router as patients_router
...
api_v1.include_router(patients_router)
```

**Ordem importa** quando rotas colidem. Ex.: `sessions_router` (`/users/presence`) é incluído antes de `users_router` (`/users/{user_id}`) porque FastAPI resolve a primeira que casa.

## 6. Testar

```bash
# login
curl -X POST localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"carla.mendonca","password":"Admin@123"}'

# contexto
curl -X POST localhost:8000/api/v1/work-context/select \
  -H "Authorization: Bearer <access>" \
  -H "Content-Type: application/json" \
  -d '{"municipalityId":"...","facilityId":"..."}'

# endpoint
curl localhost:8000/api/v1/patients \
  -H "Authorization: Bearer <access>" \
  -H "X-Work-Context: <ctx>"
```

No Swagger (`/docs`) dá para testar sem curl, usando o botão "Authorize".

## Dicas

- **Nunca** importe `repository.py` de outro módulo — só services.
- **Pydantic v2**: use `model_validate(obj, from_attributes=True)` no service para converter ORM → schema.
- **Erros esperados**: levante `AppError("código", "mensagem", status=400)` do `core.exceptions`; é traduzido em JSON padronizado pelo handler global.
- **Paginação**: veja `app/core/pagination.py` (cursor-based).
- **Rate limit**: `@limiter.limit("5/minute")` usando o `limiter` de `app.modules.auth.router`.

## Fluxo de auditoria automática

Mutações (`POST`, `PATCH`, `PUT`, `DELETE`) são auto-logadas pelo `AuditWriterMiddleware` quando o endpoint define um recurso declarado. Para controle fino (ex.: login, troca de senha), chame `write_audit(...)` no service.
