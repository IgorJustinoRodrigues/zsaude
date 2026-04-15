# RBAC — perfis, permissões e overrides

Sistema de autorização granular do zSaúde. Controla quem pode fazer o quê,
onde e com quais exceções.

## Visão geral

```
catálogo (código Python)  ← source of truth das permissões
        │
        ▼
 app.permissions          ← espelho sincronizado no startup
        │
        ▼
    app.roles             ← perfis (SYSTEM global | MUNICIPALITY local)
        │ parent_id (herança)
        ▼
 app.role_permissions     ← grant/deny explícito
                               │
                               ▼
            app.facility_accesses     ← user × unidade → role
                     │
                     ▼
    app.facility_access_permission_overrides
            ← grant/deny por acesso específico
```

**Precedência** (mais específico vence):

```
override do acesso  >  role filho  >  role pai  >  role SYSTEM base  >  deny (default)
```

MASTER (`User.level == MASTER`) é **super-usuário** — `is_root=True`,
passa em qualquer checagem independentemente de role/overrides.

## Conceitos

### Permission (catálogo)

Código no formato ``modulo.recurso.acao`` (ex.: ``cln.patient.edit``).
Declarado em `app/core/permissions/catalog.py`, sincronizado para
`app.permissions` no startup. **Nunca** editado via UI — editar código
implica deploy.

### Role (perfil)

- **SYSTEM** (`scope=SYSTEM`, `municipality_id=null`): globais, seeded em
  `app/core/permissions/seed.py`. Gerenciados por MASTER em `/sys/perfis`.
  Ex.: `doctor_base`, `nurse_base`, `lab_tech_base`.
- **MUNICIPALITY** (`scope=MUNICIPALITY`, `municipality_id=...`): criados
  pelo ADMIN do município em `/shared/perfis`. Herdam de um SYSTEM role ou
  de outro MUNICIPALITY role do mesmo município.
- `parent_id` define **herança dinâmica** — mudanças no pai propagam pros
  filhos que não sobrescreveram a permissão.
- `version` bumpa em qualquer mudança → invalida cache.

### RolePermission (grant/deny explícito)

Uma linha por `(role_id, permission_code)` com `granted: bool`.
Ausência de linha = **herda do pai**. Isso permite o tri-state:

- `granted=true` → concede explicitamente.
- `granted=false` → nega explicitamente (mesmo que pai conceda).
- sem linha → herda.

### FacilityAccess

Vínculo de um usuário com uma unidade. Campos: `user_id`, `facility_id`,
`role_id` (obrigatório), `version`.

### FacilityAccessPermissionOverride

Override por acesso: grant/deny específico naquele (usuário, unidade)
sem alterar o perfil. Útil para "Fulana é Recepcionista, mas **nessa**
unidade não pode cancelar agendamento."

## Resolução

`app/modules/permissions/service.py::PermissionService.resolve(user_id, access_id)`:

1. Se `user.level == MASTER` → `ResolvedPermissions(is_root=True)`.
2. Caminha a cadeia do role (`role → parent → ...`, até 16 níveis).
3. Acumula `role_permissions` do **mais base para o mais específico**.
4. Aplica overrides do acesso (precedência máxima).
5. Retorna `frozenset` dos códigos com `granted=True`.

**Cache** em Valkey, chave `perms:{user_id}:{access_id}`, TTL 15 min.
Invalidação explícita ao mudar role/override via `RoleService._invalidate_chain`.

## Como adicionar um recurso novo (receita)

Exemplo: criar permissão `dgn.exam.request` + endpoint + UI condicional.

### 1. Declarar a permissão

Em `app/core/permissions/catalog.py`:

```python
# ── DGN ──
P("dgn.exam.view",    "Visualizar solicitações de exame")
P("dgn.exam.request", "Solicitar exame")
```

No próximo boot o `sync_permissions()` popula `app.permissions`
automaticamente. Aparece na matriz em `/sys/perfis` agrupada no módulo `dgn`.

### 2. (Opcional) Conceder nos perfis base

Em `app/core/permissions/seed.py`, lista `_SYSTEM_BASE_ROLES`:

```python
(
    "doctor_base",
    "Médico",
    "Consulta clínica e prescrição.",
    [
        # ... outras ...
        "dgn.exam.view", "dgn.exam.request",
    ],
),
```

Ou crie um role novo (ex.: `lab_tech_base`). Re-rodar seed ou reiniciar
o app aplica.

### 3. Guard no endpoint

Em `app/modules/dgn/router.py`:

```python
from app.core.deps import DB, WorkContext, requires

@router.get("/exams", response_model=list[ExamOut])
async def list_exams(
    db: DB,
    ctx: WorkContext = requires(permission="dgn.exam.view"),
):
    ...

@router.post("/exams", status_code=201)
async def create_exam(
    payload: ExamIn,
    db: DB,
    ctx: WorkContext = requires(permission="dgn.exam.request"),
):
    ...
```

Usuário sem a permissão recebe **403** automaticamente. `ctx.permissions`
traz o `ResolvedPermissions` já resolvido.

**Outras formas de guard:**

```python
# Qualquer uma das permissões:
ctx: WorkContext = requires(any_of=["cln.patient.view", "cln.patient.edit"])

# Qualquer permissão no módulo (útil para listagens genéricas):
ctx: WorkContext = requires(module="cln")

# Só MASTER:
user: MasterDep
```

### 4. Incluir o router em `api/v1.py`

```python
from app.modules.dgn.router import router as dgn_router
api_v1.include_router(dgn_router)
```

### 5. Teste com personas diferentes

```bash
# Como MASTER (tudo passa)
curl ... -u igor.santos:Admin@123 /api/v1/dgn/exams → 200

# Como doctor (tem dgn.exam.request)
curl ... -u rafael.campos:Admin@123 POST /api/v1/dgn/exams → 201

# Como técnico (não tem dgn.exam.request)
curl ... -u diego.figueiredo:Admin@123 POST /api/v1/dgn/exams → 403
```

## Guardando dentro do service (não só no router)

`requires()` guarda a **entrada** do endpoint. Para checagens finas
dentro do código (ex.: "só lê dados sensíveis se for médico"):

```python
if "cln.patient.sensitive.view" not in ctx.permissions:
    patient.cpf = anonimize(patient.cpf)
```

`ctx.permissions` é um `ResolvedPermissions` com `__contains__` eficiente.

## Invalidação de cache

Automática quando você usa os services:

- `RoleService.set_permissions()`, `.update()`, `.archive()` bumpam
  `role.version` + todos descendentes e chamam `invalidate_user()`
  para cada usuário afetado.
- `AccessPermissionService.set_overrides()` bumpa `access.version` e
  chama `invalidate_access(user_id, access_id)`.

**Manual** (se precisar forçar):

```python
from app.modules.permissions.service import PermissionService

await PermissionService(db, valkey).invalidate_user(user_id)
# ou pontual
await PermissionService(db, valkey).invalidate_access(user_id, access_id)
```

## Auditoria

Todas as mutações de RBAC viram linha em `app.audit_logs` com
`module="roles"`:

| Action | Severity | Quando |
|---|---|---|
| `create` | warning (SYSTEM) / info | Criar perfil |
| `update` | warning / info | Nome/descrição/parent |
| `archive` / `unarchive` | warning / info | Mudar status |
| `permissions_set` | warning / info | Ajustar matriz do perfil |
| `override_set` | warning | Override por acesso |

Campos úteis:

- `resource_id` → `role.id` ou `facility_access.id`.
- `details.changes` → lista de `{code, from, to}` (tri-state textual).
- `details.targetUserName` (em `override_set`) → dono do acesso.

Consulta via `GET /api/v1/audit?module=roles` (permissão `audit.log.view`).

## Endpoints de administração

### MASTER (sem contexto)

| Método | Path | Permissão |
|---|---|---|
| GET | `/api/v1/admin/roles` | MASTER |
| GET | `/api/v1/admin/roles/{id}` | MASTER |
| POST | `/api/v1/admin/roles?municipalityId=...` | MASTER |
| PATCH | `/api/v1/admin/roles/{id}` | MASTER |
| POST | `/api/v1/admin/roles/{id}/archive` | MASTER |
| POST | `/api/v1/admin/roles/{id}/unarchive` | MASTER |
| PUT | `/api/v1/admin/roles/{id}/permissions` | MASTER |
| GET | `/api/v1/admin/users/{uid}/accesses/{aid}/permissions` | MASTER |
| PUT | `/api/v1/admin/users/{uid}/accesses/{aid}/permissions` | MASTER |

### Contexto município (com `X-Work-Context`)

| Método | Path | Permissão |
|---|---|---|
| GET | `/api/v1/permissions` | `roles.role.view` |
| GET | `/api/v1/roles` | `roles.role.view` |
| GET | `/api/v1/roles/{id}` | `roles.role.view` |
| POST | `/api/v1/roles` | `roles.role.create` |
| PATCH | `/api/v1/roles/{id}` | `roles.role.edit` |
| POST | `/api/v1/roles/{id}/archive` | `roles.role.archive` |
| PUT | `/api/v1/roles/{id}/permissions` | `roles.permission.assign` |
| GET | `/api/v1/users/{uid}/accesses/{aid}/permissions` | `roles.override.manage` |
| PUT | `/api/v1/users/{uid}/accesses/{aid}/permissions` | `roles.override.manage` |

## Padrões de perfis

| Perfil SYSTEM | Pra quem |
|---|---|
| `system_admin` | MASTER da plataforma (mantido por consistência) |
| `municipality_admin` | ADMIN do município (RBAC + users + audit) |
| `doctor_base` | Médico — CLN + DGN básico |
| `nurse_base` | Enfermagem — triagem, fila |
| `receptionist_base` | Recepção — agenda e cadastro |
| `lab_tech_base` | Técnico de lab — DGN coleta/libera |
| `manager_base` | Gestor — relatórios operacionais |
| `visa_agent_base` | Fiscal VISA |

Município cria perfis próprios herdando desses e customizando.

## Convenções e armadilhas

- **Código de permissão** sempre `modulo.recurso.acao` (3 partes, minúsculas,
  `_` permitido). Três partes é enforçado no `register()`.
- **Nunca** delete uma permissão do catálogo direto — role_permissions
  continuam referenciando. Deprecar via descrição e remover num ciclo
  posterior depois que nenhum role ativo a usa.
- **Não confunda** `users.user.*` (gestão de cadastro) com `roles.role.*`
  (gestão de perfis). São módulos diferentes.
- **MASTER criando outros MASTER**: só MASTER pode elevar outro user a
  MASTER (validado em `UserService`).
- **Endpoints novos de plataforma (SYS)**: use `MasterDep`. Não invente
  permissões `sys.*` pra proteger endpoints MASTER — o nível já protege.

## Veja também

- [Frontend RBAC](../frontend/rbac.md) — como consumir no React.
- [Segurança](./security.md) — JWT, contexto, níveis.
- [Auditoria](./audit-and-sessions.md) — leitura dos logs.
