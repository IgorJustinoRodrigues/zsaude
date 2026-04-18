# Audit Logs e Observabilidade

Guia para devs de como adicionar logs legíveis em qualquer nova ação do sistema.

## Princípio

Todo log — seja `audit_logs` (persistido em DB) ou structlog (JSON stream) —
deve ser **legível por um humano sem consultar IDs**.

### Errado ❌

```
patient_update pid=019d9e10... fields=[name, phone]
```

### Certo ✅

```
Igor Santos editou o paciente João Silva (nome, telefone)
```

---

## Arquitetura de auditoria

### `audit_logs` (DB, schema app)

Eventos de negócio persistidos para compliance/LGPD. Cada linha tem:

| Campo | Propósito |
|---|---|
| `user_id` / `user_name` | Quem (auto-injetado pelo `AuditContext` via middleware) |
| `module` | `hsp`, `auth`, `sys`, etc. — em lowercase |
| `action` | Código técnico: `patient_create`, `patient_photo_upload` |
| `severity` | `info`, `warning`, `error`, `critical` |
| `resource` / `resource_id` | Entidade alvo (`patient` + UUID) |
| **`description`** | **Frase humana que aparece na UI de auditoria** |
| `details` | JSON estruturado com contexto adicional |
| `ip` / `user_agent` / `request_id` | Auto pelo middleware |
| `municipality_id` / `facility_id` | Auto via `WorkContext` |

### Structlog (stream JSON, via Loki/ELK)

Eventos técnicos de infra/debug. Não aparecem na UI, mas ficam em logs
estruturados. Use quando algo não é "ação humana" (ex: job failed,
cache miss).

---

## Helpers disponíveis

Arquivo: `app/modules/audit/helpers.py`

### `describe_change(actor, verb, target_name, changed_fields, extra)`

Monta a frase humana que vai em `description`. Exemplos:

```python
from app.modules.audit.helpers import describe_change
from app.core.audit import get_audit_context

actor = get_audit_context().user_name   # auto pelo middleware

# Caso típico: edição com lista de campos alterados
describe_change(
    actor=actor, verb="editou o paciente",
    target_name="João Silva",
    changed_fields=["nome", "telefone"],
)
# → "Igor Santos editou o paciente João Silva (nome, telefone)"

# Sem alvo específico (operação global)
describe_change(
    actor=actor, verb="reindexou o reconhecimento facial do município",
    extra="950 pacientes · 2 erro(s)",
)
# → "Igor Santos reindexou o reconhecimento facial do município — 950 pacientes · 2 erro(s)"

# Sistema (actor vazio vira "Sistema")
describe_change(
    actor="", verb="importou a tabela SIGTAP",
    extra="competência 202601 · 1200 linhas",
)
# → "Sistema importou a tabela SIGTAP — competência 202601 · 1200 linhas"
```

### `diff_fields(before, after)` + `snapshot_fields(obj, [...])`

Compara dois dicts e devolve lista de `FieldChange` com before/after já
formatados (data → ISO, bool → "sim/não", enum → value, "" → "(vazio)").

```python
from app.modules.audit.helpers import diff_fields, snapshot_fields

before = snapshot_fields(patient, ["name", "cpf", "phone"])
# ... aplica mudanças ...
after = snapshot_fields(patient, ["name", "cpf", "phone"])

changes = diff_fields(before, after)
# changes[0] = FieldChange(
#     field="phone", label="telefone",
#     before="(vazio)", after="(62) 99999-9999",
# )

await write_audit(
    ..., description=describe_change(
        actor=actor, verb="editou o paciente",
        target_name=patient.name,
        changed_fields=[c.label for c in changes],
    ),
    details={"changes": [c.as_dict() for c in changes]},
)
```

### `humanize_field(name)` / `humanize_value(value)`

Convertem campos/valores técnicos em labels PT-BR. Adicione mapeamentos
no dict `_FIELD_LABELS` em `helpers.py` conforme novos campos aparecem.

---

## Padrão de uso nos endpoints

### Ação de **escrita** (CREATE/UPDATE/DELETE)

No service (onde a regra de negócio mora, não no router):

```python
from app.modules.audit.helpers import describe_change
from app.modules.audit.writer import write_audit

async def update_patient(self, patient_id, payload):
    patient = await self.get_patient(patient_id)
    # captura before
    before = snapshot_fields(patient, ["name", "cpf", ...])
    # aplica mudanças
    # ...
    after = snapshot_fields(patient, ["name", "cpf", ...])
    changes = diff_fields(before, after)

    await write_audit(
        self.db,
        module="hsp", action="patient_update", severity="info",
        resource="patient", resource_id=str(patient.id),
        description=describe_change(
            actor=self.user_name, verb="editou o paciente",
            target_name=patient.name,
            changed_fields=[c.label for c in changes],
        ),
        details={
            "patientName": patient.name,
            "changes": [c.as_dict() for c in changes],
        },
    )
```

### Ação de **leitura sensível** (acesso a PHI/LGPD)

No router, após buscar o dado:

```python
@router.get("/patients/{patient_id}")
async def get_patient(patient_id, db, ctx = requires(...)):
    patient = await svc.get_patient(patient_id)
    await write_audit(
        db, module="hsp", action="patient_view", severity="info",
        resource="patient", resource_id=str(patient.id),
        description=describe_change(
            actor=get_audit_context().user_name,
            verb="consultou o prontuário de",
            target_name=patient.name,
        ),
        details={"patientName": patient.name, "prontuario": patient.prontuario},
    )
    return _to_read(patient)
```

### Operação externa (CadSUS, provedor IA, etc.)

Use `severity="warning"` pra destacar na auditoria — são pontos de atenção
LGPD/custo:

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

---

## Quando **não** logar

Não polua a auditoria com ruído:

- **Listagens paginadas sem filtro** (navegação padrão de UI).
- **Health checks** e endpoints `/metrics`.
- **Consultas internas** (ex: sistema chamando sistema via cron).
- **Endpoints públicos** que não retornam PHI (config pública do app).

Log de leitura sensível vale quando expõe **dados de paciente específico**
ou **busca por dado identificador** (CPF, CNS, nome completo).

---

## Convenções

### Severity

- `info`: operação normal (cadastro, edição, leitura sensível)
- `warning`: destruição reversível (desativar paciente, remover foto),
  operação externa (CadSUS), role SYSTEM modificado
- `error`: falha operacional que o usuário viu (ex: erro no upload)
- `critical`: incidente grave (replay de token, invasão detectada)

### Action names

Padrão: `<entidade>_<verbo>` em snake_case:

- `patient_create`, `patient_update`, `patient_deactivate`, `patient_reactivate`
- `patient_view`, `patient_search`, `patient_lookup`
- `patient_photo_upload`, `patient_photo_remove`, `patient_photo_download`, `patient_photo_restore`
- `patient_history_view`
- `face_match`, `face_embedding_delete`, `face_reindex`
- `cadsus_search`
- `login`, `login_failed`, `logout`
- `role_create`, `role_edit`, `role_delete`
- `sigtap_import`, `cnes_import`
- `setting_update`

### Module names

Sempre **lowercase**: `hsp`, `auth`, `sys`, `ops`, `roles`, `users`, `tenants`.

### Details

JSON sempre **camelCase** (fica no payload da UI que consome via API).
Evite colocar IDs puros — prefira nome + ID:

```python
details={
    "patientName": patient.name,          # ✓ legível
    "patientId": str(patient.id),         # opcional — pra link
    "changes": [...],                     # estruturado
}
```

---

## Verificando o que está gravado

Queries úteis no DBeaver:

```sql
-- Últimos 50 eventos
SELECT created_at, user_name, severity, description
  FROM app.audit_logs
 ORDER BY created_at DESC
 FETCH FIRST 50 ROWS ONLY;

-- Eventos de 1 paciente específico (todos os usuários que tocaram nele)
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

-- Operações sensíveis (warning/error)
SELECT created_at, user_name, action, description
  FROM app.audit_logs
 WHERE severity IN ('warning', 'error', 'critical')
 ORDER BY created_at DESC FETCH FIRST 100 ROWS ONLY;
```

---

## Checklist ao adicionar nova feature

- [ ] Toda ação **escrita** (CREATE/UPDATE/DELETE) tem `write_audit`?
- [ ] Toda ação **sensível** de leitura (PHI, exportação, download) tem `write_audit`?
- [ ] A `description` usa `describe_change()` com verbo em PT?
- [ ] `target_name` é o nome humano (não o UUID)?
- [ ] `changed_fields` lista os **labels** (`humanize_field`), não os nomes técnicos?
- [ ] `details` tem `nameField: "..."` quando faz referência a outras entidades?
- [ ] `severity` está consistente (warning pra destruição / externa)?
- [ ] `module` em lowercase, `action` em snake_case?
