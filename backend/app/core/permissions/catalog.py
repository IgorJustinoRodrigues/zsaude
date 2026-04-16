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

# ── Usuários ────────────────────────────────────────────────────────────────
P("users.user.view", "Visualizar usuários")
P("users.user.create", "Criar usuário")
P("users.user.edit", "Editar usuário")
P("users.user.archive", "Arquivar usuário")
P("users.user.reset_password", "Redefinir senha de outro usuário")
P("users.access.view", "Visualizar acessos de usuário")
P("users.access.manage", "Conceder/remover acesso a município ou unidade")

# ── Auditoria ───────────────────────────────────────────────────────────────
P("audit.log.view", "Consultar logs de auditoria")

# ── Operações (relatórios, presença, importações) ──────────────────────────
P("ops.session.view", "Visualizar sessões e presença de usuários")
P("ops.report.view", "Visualizar relatórios operacionais")
P("ops.report.export", "Exportar relatórios")
P("ops.import.execute", "Executar importações (CNES, etc) no município atual")
P("ops.import.view", "Visualizar histórico de importações")

# ── DGN (Diagnóstico) ───────────────────────────────────────────────────────
P("dgn.exam.view", "Visualizar solicitações de exame")
P("dgn.exam.request", "Solicitar exame")

# ── HSP (Hospitalar) — cadastro de paciente ────────────────────────────────
P("hsp.patient.view", "Visualizar pacientes")
P("hsp.patient.create", "Cadastrar paciente")
P("hsp.patient.edit", "Editar paciente")
P("hsp.patient.delete", "Desativar paciente")
P("hsp.patient.export", "Exportar dados de pacientes")
P("hsp.patient_photo.upload", "Enviar ou remover foto do paciente")
P("hsp.patient_photo.view", "Visualizar foto do paciente")
P("hsp.patient_history.view", "Visualizar histórico de alterações do paciente")

# ── Gateway de IA ───────────────────────────────────────────────────────────
P("ai.operations.use", "Usar operações de IA (consumidor)")
# Configuração de IA é centralizada no SYS (MASTER) — não precisa de perm por
# município. A tela de OPS foi removida; OPS só consome operations via ai.operations.use.
