"""Catálogo declarativo de permissões.

**Apenas permissões que têm endpoint/guard real no sistema.** Se o código
não usa ``requires(permission=...)`` ou ``ctx.permissions.__contains__`` com
o código, ele não aparece aqui. Ao criar um módulo novo, adicione a
permissão aqui **ao mesmo tempo** que cria o endpoint gateado.

Importar este módulo popula o registry. A sincronização com o banco é feita
pelo ``sync_permissions()`` no startup — remove do DB o que sumiu daqui.

Convenção dos códigos: ``modulo.recurso.acao`` (ex.: ``cln.patient.edit``).
"""

from __future__ import annotations

from app.core.permissions.registry import register as P

# ── Roles (gestão de perfis e personalizações) ──────────────────────────────
P("roles.role.view", "Visualizar perfis")
P("roles.role.create", "Criar perfil")
P("roles.role.edit", "Editar perfil")
P("roles.role.archive", "Arquivar perfil")
P("roles.permission.assign", "Ajustar permissões de perfil")
P("roles.override.manage", "Personalizar permissões por acesso de usuário")

# ── DGN (Diagnóstico) ───────────────────────────────────────────────────────
P("dgn.exam.view", "Visualizar solicitações de exame")
P("dgn.exam.request", "Solicitar exame")
