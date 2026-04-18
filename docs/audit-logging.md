# Audit Logs — Guia Completo

Guia para devs de como adicionar logs de auditoria legíveis em qualquer
nova ação do sistema. Os logs aparecem na UI em **Sistema → Logs** e
**Operações → Auditoria** sem precisar resolver UUIDs manualmente.

---

## 1. Princípio

Toda ação registrada deve ser **legível por um humano sem consultar IDs**.

### Errado ❌

```
patient_update pid=019d9e10-... fields=[name, phone]
Criou recurso em /api/v1/sys/reference/etnias/019d9e....
overrides aplicados em 019d9e10... (3 permissão(ões))
```

### Certo ✅

```
Igor Santos editou o paciente João Silva (nome, telefone)
Igor Santos cadastrou a etnia Indígena (IND)
Igor Santos ajustou permissões de Maria Oliveira — 3 permissão(ões) alterada(s)
```

A frase sempre tem: **quem** (nome do usuário) + **o que** (verbo) +
**alvo** (nome humano) + **contexto** (campos alterados ou "extra").

---

## 2. Como os logs são gravados

Existem **dois caminhos** — o middleware genérico (automático) e a
chamada explícita (controlada). Saber quando usar cada um é o ponto
principal deste guia.

### 2.1. Middleware automático

Arquivo: `app/middleware/audit_writer.py` (classe `AuditWriterMiddleware`).

Intercepta **toda** requisição HTTP mutante (POST/PATCH/PUT/DELETE) sob
`/api/v1/*` e grava um `AuditLog` com:

- `module` inferido de `PATH_TO_MODULE` (ex: `/api/v1/hsp/*` → `hsp`).
- `action` = método HTTP → ação (`POST` → `create`, `DELETE` → `delete`, etc).
- `description` = entrada de `PATH_DESCRIPTION` ou fallback genérico.
- `details.body` = corpo da requisição (com senhas redigidas).

**Quando usar:** endpoints simples sem nome humano relevante — rotas
administrativas básicas, stubs, ações sem diff detalhado.

**Quando NÃO usar:** endpoints que precisam:
- Saber o **nome do alvo** (ex: `"editou o paciente João"` em vez de UUID)
- Detalhar **campos alterados** (`diff_fields`)
- Lógica condicional (só logar se algo mudou)
- Severidade diferente do padrão

Nesse caso, use chamada explícita e **adicione o path ao `SKIP_PATTERNS`**
para evitar duplicação.

### 2.2. Chamada explícita

Arquivo: `app/modules/audit/writer.py` → função `write_audit(...)`.

Você chama no service (ou no router quando é PHI). O `AuditContext`
(via contextvars) já injeta automaticamente: `user_id`, `user_name`,
`municipality_id`, `facility_id`, `role`, `ip`, `user_agent`, `request_id`.

```python
from app.core.audit import get_audit_context
from app.modules.audit.helpers import describe_change
from app.modules.audit.writer import write_audit

actor = get_audit_context().user_name
await write_audit(
    db,
    module="hsp",
    action="patient_update",
    severity="info",
    resource="patient",
    resource_id=str(patient.id),
    description=describe_change(
        actor=actor, verb="editou",
        target_kind="paciente",
        target_name=patient.name,
        changed_fields=["nome", "telefone"],
    ),
    details={"patientName": patient.name, "changes": [...]},
)
```

---

## 3. Helpers (obrigatórios)

Arquivo: `app/modules/audit/helpers.py`

### `describe_change(actor, verb, target_kind="", target_name="", changed_fields=None, extra="")`

Monta a frase humana. **Todo** `description` de audit explícito deve
passar por aqui.

| Parâmetro | O que é | Exemplo |
|---|---|---|
| `actor` | Nome de quem fez (vazio vira `"Sistema"`) | `"Igor Santos"` |
| `verb` | Verbo conjugado em PT | `"editou"`, `"removeu"`, `"consultou"` |
| `target_kind` | Tipo do alvo (omite se vazio) | `"paciente"`, `"unidade"` |
| `target_name` | Nome legível (não UUID) | `"João Silva"` |
| `changed_fields` | Lista de labels humanos | `["nome", "telefone"]` |
| `extra` | Texto livre no final, após `—` | `"3 resultado(s)"` |

Exemplos:

```python
# Edição com diff
describe_change(actor="Igor Santos", verb="editou",
                target_kind="paciente", target_name="João Silva",
                changed_fields=["nome", "telefone"])
# → "Igor Santos editou o paciente João Silva (nome, telefone)"

# Criação
describe_change(actor="Igor Santos", verb="cadastrou",
                target_kind="unidade", target_name="UBS Central")
# → "Igor Santos cadastrou a unidade UBS Central"

# Leitura PHI
describe_change(actor="Maria", verb="consultou reconhecimento facial",
                extra="5 candidatos, melhor: João (87%)")
# → "Maria consultou reconhecimento facial — 5 candidatos, melhor: João (87%)"

# Sistema (seeds, jobs)
describe_change(actor="", verb="importou tabela SIGTAP",
                extra="competência 202601 · 1200 linhas")
# → "Sistema importou tabela SIGTAP — competência 202601 · 1200 linhas"
```

### `diff_fields(before, after, *, ignore=())` + `snapshot_fields(obj, fields)`

Compara dois dicts antes/depois e devolve lista de `FieldChange`
já com valores formatados (data → ISO, bool → "sim/não", enum → `.value`,
`None`/`""` → `"(vazio)"`).

```python
before = snapshot_fields(patient, ["name", "cpf", "phone"])
# ... aplica mudanças ...
after = snapshot_fields(patient, ["name", "cpf", "phone"])
changes = diff_fields(before, after)

await write_audit(
    ...,
    description=describe_change(
        actor=actor, verb="editou",
        target_kind="paciente", target_name=patient.name,
        changed_fields=[c.label for c in changes],
    ),
    details={"changes": [c.as_dict() for c in changes]},
)
```

### `humanize_field(name)` / `humanize_value(value)`

Convertem campos/valores técnicos em labels PT-BR:

```python
humanize_field("birth_date")   # "data de nascimento"
humanize_field("social_name")  # "nome social"
humanize_field("cnes")         # "CNES"

humanize_value(True)            # "sim"
humanize_value(date(2026,4,18)) # "2026-04-18"
humanize_value(None)            # "(vazio)"
```

**Ao adicionar novos campos**, atualize `_FIELD_LABELS` em `helpers.py`.

---

## 4. Árvore de decisão — middleware vs. explícito

```
Sua nova rota é mutante (POST/PATCH/PUT/DELETE)?
│
├── Não → GET com leitura de PHI? → Sim → chamar write_audit no router
│                                   ↓
│                                   Não → sem audit (leitura pública)
│
└── Sim → Precisa do nome do alvo na description?
         OU gravar diff de campos?
         OU severidade custom (warning/error)?
         │
         ├── Não → deixa o middleware cuidar. Se a description
         │        genérica não fica boa, adicione uma entrada em
         │        PATH_DESCRIPTION no audit_writer.py
         │
         └── Sim → write_audit explícito no service + adicione o
                  path em SKIP_PATTERNS pra evitar duplicação.
```

---

## 5. Padrões por tipo de operação

### 5.1. CREATE

```python
from app.core.audit import get_audit_context
from app.modules.audit.helpers import describe_change
from app.modules.audit.writer import write_audit

patient = Patient(...)
db.add(patient); await db.flush()

actor = get_audit_context().user_name
await write_audit(
    db, module="hsp", action="patient_create", severity="info",
    resource="patient", resource_id=str(patient.id),
    description=describe_change(
        actor=actor, verb="cadastrou",
        target_kind="paciente", target_name=patient.name,
        extra=f"prontuário {patient.prontuario}",
    ),
    details={"patientName": patient.name, "prontuario": patient.prontuario},
)
```

### 5.2. UPDATE com diff

```python
before = snapshot_fields(patient, ["name", "phone", "email"])
# ... aplica mudanças via payload ...
after = snapshot_fields(patient, ["name", "phone", "email"])
changes = diff_fields(before, after)

if changes:
    await write_audit(
        db, module="hsp", action="patient_update", severity="info",
        resource="patient", resource_id=str(patient.id),
        description=describe_change(
            actor=actor, verb="editou",
            target_kind="paciente", target_name=patient.name,
            changed_fields=[c.label for c in changes],
        ),
        details={
            "patientName": patient.name,
            "changes": [c.as_dict() for c in changes],
        },
    )
```

> **Importante:** só grave audit se `changes` não estiver vazio.
> PATCH que não alterou nada não vira log.

### 5.3. DELETE (hard) / Arquivamento (soft)

```python
# severity=warning porque é destrutivo (mesmo reversível)
await write_audit(
    db, module="hsp", action="patient_deactivate", severity="warning",
    resource="patient", resource_id=str(patient.id),
    description=describe_change(
        actor=actor, verb="arquivou",
        target_kind="paciente", target_name=patient.name,
    ),
    details={"patientName": patient.name, "reason": payload.reason},
)
```

### 5.4. Leitura de PHI / dados sensíveis

No router, depois de carregar o dado:

```python
@router.get("/patients/{patient_id}")
async def get_patient(patient_id, db, ctx = requires(...)):
    patient = await svc.get_patient(patient_id)
    await write_audit(
        db, module="hsp", action="patient_view", severity="info",
        resource="patient", resource_id=str(patient.id),
        description=describe_change(
            actor=get_audit_context().user_name,
            verb="consultou",
            target_kind="prontuário de",
            target_name=patient.name,
        ),
        details={"patientName": patient.name, "prontuario": patient.prontuario},
    )
    return _to_read(patient)
```

### 5.5. Operação externa (CadSUS, API de IA, storage externo)

`severity="warning"` pra destacar na auditoria — são pontos de atenção
LGPD/custo/compliance.

```python
await write_audit(
    db, module="hsp", action="cadsus_search", severity="warning",
    resource="cadsus", resource_id="",
    description=describe_change(
        actor=actor, verb="pesquisou CadSUS",
        extra=f"CPF ***{cpf[-2:]} · {len(items)} resultado(s)",
    ),
    details={"criteria": [...], "results": len(items)},
)
```

### 5.6. Importações / jobs / seeds (sem usuário humano)

`actor=""` faz o helper usar `"Sistema"`.

```python
await write_audit(
    db, module="sigtap", action="sigtap_import", severity="info",
    resource="sigtap_import", resource_id=str(imp.id),
    description=describe_change(
        actor="", verb="importou a tabela SIGTAP",
        extra=f"competência {imp.competence} · {imp.rows} linhas",
    ),
    details={"competence": imp.competence, "rows": imp.rows},
)
```

### 5.7. Ação de segurança (login, replay, token)

Sempre no service, nunca via middleware — você precisa do identifier
mesmo quando o usuário não existe.

```python
await write_audit(
    db, module="auth", action="login_failed", severity="warning",
    resource="Session",
    description=describe_change(
        actor=user.name if user else identifier,
        verb="falhou ao entrar",
        extra=reason,
    ),
    details={"identifier": identifier, "reason": reason},
    user_id=user.id if user else None,
    user_name=user.name if user else identifier,
    ip=ip, user_agent=ua,
)
```

---

## 6. Middleware — configurar para a sua rota

Arquivo: `app/middleware/audit_writer.py`.

### 6.1. `SKIP_PATTERNS`

Regex que listam paths **que têm write_audit explícito**. O middleware
pula esses para não duplicar.

Exemplo: você criou `POST /api/v1/exames/{id}/resultado` com audit
explícito no service. Adicione:

```python
SKIP_PATTERNS: tuple[re.Pattern[str], ...] = (
    ...
    re.compile(r"/api/v1/exames/[^/]+/resultado$"),
)
```

### 6.2. `PATH_TO_MODULE`

Mapeia prefixo de path → nome do módulo (sempre lowercase). Se sua
rota nova não bate em nenhum prefixo, o fallback é `"api"` — o que é
feio. Sempre adicione.

```python
PATH_TO_MODULE: list[tuple[str, str]] = [
    ...
    ("/api/v1/exames/", "exames"),
]
```

### 6.3. `PATH_DESCRIPTION`

Se for deixar o middleware cuidar do log mas a frase genérica não fica
boa, adicione uma descrição humana:

```python
PATH_DESCRIPTION: list[tuple[re.Pattern[str], str]] = [
    ...
    (re.compile(r"/exames/[^/]+/cancelar$"), "Cancelou exame"),
]
```

### 6.4. `URL_SUFFIX_ACTIONS`

Sobrescreve a ação inferida do método HTTP baseado no sufixo da URL:

```python
URL_SUFFIX_ACTIONS: list[tuple[re.Pattern[str], str]] = [
    ...
    (re.compile(r"/archive$"), "delete"),  # POST /archive vira action=delete
]
```

---

## 7. Convenções obrigatórias

### 7.1. `module` sempre lowercase

```python
module="hsp"      # ✓
module="HSP"      # ✗ historic bug — não use
module="Hsp"      # ✗
```

Lista canônica (veja `PATH_TO_MODULE` e `auditLabels.ts` no frontend):

`auth`, `users`, `tenants`, `sys`, `roles`, `audit`, `ai`, `sigtap`,
`cnes`, `reference`, `hsp`, `cln`, `dgn`, `pln`, `fsc`, `ops`, `ind`,
`cha`, `esu`, `permissions`.

### 7.2. `action` em snake_case, prefixada pelo domínio

Padrão: `<entidade>_<verbo>`.

✓ Bons exemplos:

- `patient_create`, `patient_update`, `patient_deactivate`, `patient_view`
- `patient_photo_upload`, `patient_photo_remove`
- `face_match`, `face_reindex`, `face_embedding_delete`
- `user_create`, `user_edit`, `user_reset_password`
- `role_create`, `role_archive`, `permission_override`
- `municipality_create`, `municipality_update`, `municipality_archive`
- `facility_create`, `facility_update`, `facility_archive`
- `cadsus_search`, `sigtap_import`, `cnes_import`
- `setting_update`, `select_context`
- `login`, `login_failed`, `logout`, `password_reset`, `change_password`

✗ Evite: `create`, `edit`, `delete`, `update` sem prefixo. Esses
nomes são reservados para o fallback do middleware.

Quando adicionar uma nova action, **registre a tradução PT-BR** em
`frontend/src/lib/auditLabels.ts` (`ACTION_LABELS`).

### 7.3. `severity`

| Nível | Quando |
|---|---|
| `info` | Operação normal — cadastro, edição, leitura sensível |
| `warning` | Destruição reversível (arquivar), operação externa (CadSUS), role SYSTEM modificado, password reset de outro usuário, permissão personalizada aplicada |
| `error` | Falha operacional visível ao usuário (upload falhou, erro HTTP ≥500) |
| `critical` | Incidente grave — replay de refresh token, invasão detectada |

### 7.4. `resource` / `resource_id`

Sempre preencha se houver entidade alvo. Ajuda a filtrar "todos os
eventos do paciente X" na UI.

- `resource`: nome da entidade (`patient`, `user`, `Facility`, `cadsus`).
  O frontend tem mapeamento em `RESOURCE_LABELS`.
- `resource_id`: UUID em string. Vazio para operações globais.

### 7.5. `details`

JSON estruturado, sempre em **camelCase** (é consumido pela UI via API).
Evite IDs puros — sempre inclua o **nome legível**:

```python
details={
    "patientName": patient.name,          # ✓ legível
    "patientId": str(patient.id),         # opcional — link
    "changes": [c.as_dict() for c in changes],
}
```

### 7.6. Quando NÃO logar

Não polua a auditoria com ruído:

- **Listagens paginadas sem filtro** (navegação normal).
- **Health checks** e endpoints `/metrics`.
- **Consultas internas** (sistema chamando sistema — cron, worker).
- **Endpoints públicos** sem PHI (configuração pública do app).
- **Responses 304/Not-Modified**.

Log de leitura sensível vale quando:
- Expõe **dados de paciente específico** (GET /patients/{id}).
- **Busca por identificador** (CPF, CNS, nome completo, foto).
- **Exporta / baixa** arquivo com dados pessoais.

---

## 8. Checklist ao adicionar nova feature

Antes de abrir PR:

- [ ] Toda ação **escrita** (CREATE/UPDATE/DELETE) tem `write_audit` ou é pega pelo middleware?
- [ ] Toda ação **sensível** de leitura (PHI, exportação, download) tem `write_audit` explícito?
- [ ] Se usa middleware, `PATH_TO_MODULE` tem entrada para o prefixo?
- [ ] Se usa middleware, `PATH_DESCRIPTION` tem uma frase humana (não cai no fallback genérico)?
- [ ] Se usa explícito, o path está em `SKIP_PATTERNS` (evita duplicação)?
- [ ] A `description` usa `describe_change()` — nunca f-string crua?
- [ ] `target_name` é o **nome humano**, não o UUID?
- [ ] `changed_fields` usa labels humanos (via `humanize_field`)?
- [ ] `action` em snake_case com prefixo de domínio?
- [ ] `module` em lowercase?
- [ ] `severity` consistente? (warning pra destrutivo/externo)
- [ ] `details` tem `XNameField: "..."` quando referencia outras entidades?
- [ ] Se tem action nova, `ACTION_LABELS` no frontend foi atualizado?

---

## 9. Validando no DBeaver

Queries úteis (tabela `app.audit_logs`):

```sql
-- Últimos 50 eventos
SELECT created_at, user_name, severity, description
  FROM app.audit_logs
 ORDER BY created_at DESC
 FETCH FIRST 50 ROWS ONLY;

-- Detectar logs "sem sentido" (action genérica ou module maiúsculo)
SELECT module, action, description, COUNT(*)
  FROM app.audit_logs
 WHERE module IN ('api', 'API', 'HSP', 'SYS', 'AUTH', 'OPS')
    OR action IN ('create', 'edit', 'delete', 'update')
    OR description LIKE 'Criou recurso em%'
    OR description LIKE 'Editou recurso em%'
 GROUP BY module, action, description
 ORDER BY 4 DESC;

-- Eventos de 1 paciente específico
SELECT created_at, user_name, action, severity, description
  FROM app.audit_logs
 WHERE resource = 'patient' AND resource_id = '<UUID>'
 ORDER BY created_at DESC;

-- Quem consultou PHI hoje?
SELECT user_name, COUNT(*) AS views
  FROM app.audit_logs
 WHERE action IN ('patient_view', 'patient_photo_download',
                  'cadsus_search', 'face_match')
   AND created_at >= TRUNC(SYSDATE)
 GROUP BY user_name ORDER BY views DESC;

-- Operações sensíveis (warning/error/critical)
SELECT created_at, user_name, action, description
  FROM app.audit_logs
 WHERE severity IN ('warning', 'error', 'critical')
 ORDER BY created_at DESC FETCH FIRST 100 ROWS ONLY;
```

Se a primeira query retornar linhas, algum endpoint ainda não está
seguindo o padrão — identifique pelo `module`/`action` e corrija
conforme seção 6.

---

## 10. Structlog vs audit_logs

- **`audit_logs` (DB)**: ações de negócio. Persistidas. Aparecem na UI.
  Use `write_audit`.
- **Structlog (stream JSON, Loki/ELK)**: eventos técnicos de infra/debug.
  Não aparecem na UI. Use `log = get_logger(__name__); log.info(...)`.

Se o evento é *"usuário fez X"*, é `audit_logs`. Se é *"job A processou
30 itens em 2.5s"*, é structlog.
