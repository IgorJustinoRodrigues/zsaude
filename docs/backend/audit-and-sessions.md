# Auditoria e sessões

## Auditoria

Objetivo: registrar **quem, quando, onde, o quê** para qualquer ação relevante. Inclui login, troca de contexto, mutações MASTER, edições de usuário, leitura sensível.

### Tabela

`app.audit_logs` — principais colunas:

| Coluna | Conteúdo |
|---|---|
| `id` (UUID7) | ordenação temporal |
| `happened_at` | timestamp com timezone |
| `user_id`, `user_name` | quem fez |
| `municipality_id`, `municipality_ibge`, `facility_id`, `role` | contexto no momento |
| `module` | `auth`, `users`, `tenants`, `patients`, ... |
| `action` | `create`, `update`, `delete`, `login`, `login_fail`, `context_switch`, ... |
| `resource_type`, `resource_id` | alvo da ação |
| `result` | `success`, `failure` |
| `ip`, `user_agent`, `request_id` | de onde |
| `diff` (JSONB) | mudanças (campos alterados) |
| `details` (JSONB) | payload livre |

### Como escrever um log

Dois caminhos:

**1. Automático** — `AuditWriterMiddleware` em `app/middleware/audit_writer.py` captura mutações e grava.

**2. Explícito** — chame `write_audit()` do `app/core/audit.py` no service quando o evento não é uma mutação trivial (ex.: login, leitura sensível):

```python
from app.core.audit import write_audit

await write_audit(
    db,
    module="auth",
    action="login",
    resource_type="user",
    resource_id=user.id,
    result="success",
    details={"method": "password"},
)
```

`AuditContext` (contextvars) preenche `user_id`, `user_name`, município/unidade/role, IP, UA, request_id automaticamente. Você só passa o que é específico do evento.

### Contexto dos logs

O middleware `AuditContextMiddleware` popula IP e user-agent logo no início de cada request. A dep `current_user` enriquece com `user_id`/`user_name`. A dep `current_context` adiciona município/unidade/role.

### Leitura

Endpoint `GET /api/v1/audit?...` (só ADMIN/MASTER). Filtros: módulo, ação, usuário, município, período. Veja `app/modules/audit/router.py`.

No frontend há telas dedicadas:
- MASTER: `SysAuditPage` (auditoria global).
- ADMIN/OPS: `OpsAuditReportPage`, `OpsAccessReportPage`, `OpsOccurrencesReportPage`, `OpsActivityReportPage`.

## Sessões e presença

Objetivo: saber quem está online agora, e quanto tempo cada sessão durou.

### Tabela

`app.user_sessions`:

| Coluna | Conteúdo |
|---|---|
| `id` (UUID) | session id; vai no JWT access como claim `sid` |
| `user_id` | dono |
| `family_id` | mesma família do refresh token — invalidar refresh mata sessão |
| `started_at`, `last_seen_at`, `ended_at` | ciclo de vida |
| `ip`, `user_agent` | origem |

### Ciclo

1. **Login** → cria `user_sessions` e um `refresh_tokens` com mesmo `family_id`. Access e refresh carregam o `sid`.
2. **Requests autenticados** → `current_user` chama `SessionService.touch(sid)`, que atualiza `last_seen_at`. Throttled por **30s** via `Valkey` (`SET NX EX 30`): se há lock na chave `session:touch:<sid>`, pula o UPDATE.
3. **Refresh** → rotaciona, mantém `family_id` e `sid`. Reuso detectado mata a família (`ended_at=now()`).
4. **Logout** → encerra sessão (`ended_at`), revoga refresh, invalida família.

### Valkey como throttler

Evita hammer no Postgres em telas que fazem polling. O Valkey guarda apenas um lock curto; a fonte de verdade continua no Postgres.

### Consumo no frontend

- `sessionsApi.presence('actor')` — lista usuários com `last_seen_at` recente (≤ 2min padrão). Usado no TopBar para o "X online agora".
- `sessionsApi.history(user_id)` — histórico de sessões de um usuário (start/end/duration).

Atualização automática: hooks de polling (15s) nos componentes TopBar e nas páginas de presença.

### Revogar sessão / forçar logout

- Troca de senha → incrementa `users.token_version` → todos os access tokens ficam inválidos na próxima checagem.
- Logout explícito → revoga a família do refresh.
- Admin "forçar logout" → bumpa `token_version` e encerra sessões abertas.

## Veja também

- [Segurança](./security.md) — JWT, níveis, contexto.
- [Estrutura](./structure.md) — onde vivem os arquivos.
