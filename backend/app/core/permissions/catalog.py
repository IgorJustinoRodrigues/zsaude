"""Catálogo declarativo de permissões.

Importar este módulo popula o registry. A sincronização com o banco é feita
pelo `sync_permissions()` no startup do app.

Convenção dos códigos:
- ``sys.*``   — plataforma (MASTER)
- ``users.*`` — gestão de usuários e acessos
- ``roles.*`` — gestão de perfis e permissões
- ``audit.*`` — auditoria
- ``cln.*``, ``dgn.*``, ``hsp.*``, ``pln.*``, ``fsc.*``, ``ops.*`` — módulos de domínio
"""

from __future__ import annotations

from app.core.permissions.registry import register as P

# ── SYS (plataforma) ─────────────────────────────────────────────────────────
P("sys.municipality.view", "Visualizar municípios")
P("sys.municipality.create", "Criar município")
P("sys.municipality.edit", "Editar município")
P("sys.municipality.archive", "Arquivar município")
P("sys.facility.view", "Visualizar unidades (global)")
P("sys.facility.create", "Criar unidade (global)")
P("sys.facility.edit", "Editar unidade (global)")
P("sys.facility.archive", "Arquivar unidade (global)")
P("sys.setting.view", "Visualizar configurações do sistema")
P("sys.setting.edit", "Editar configurações do sistema")

# ── Usuários ─────────────────────────────────────────────────────────────────
P("users.user.view", "Visualizar usuários")
P("users.user.create", "Criar usuário")
P("users.user.edit", "Editar usuário")
P("users.user.archive", "Arquivar usuário")
P("users.user.reset_password", "Redefinir senha de outro usuário")
P("users.access.view", "Visualizar acessos de usuário")
P("users.access.manage", "Conceder/remover acesso a município ou unidade")

# ── Perfis e permissões ──────────────────────────────────────────────────────
P("roles.role.view", "Visualizar perfis")
P("roles.role.create", "Criar perfil")
P("roles.role.edit", "Editar perfil")
P("roles.role.archive", "Arquivar perfil")
P("roles.permission.assign", "Ajustar permissões de perfil")
P("roles.override.manage", "Personalizar permissões por acesso de usuário")

# ── Auditoria ────────────────────────────────────────────────────────────────
P("audit.log.view", "Consultar logs de auditoria")

# ── CLN (Clínica) ────────────────────────────────────────────────────────────
P("cln.patient.view", "Visualizar pacientes")
P("cln.patient.create", "Cadastrar paciente")
P("cln.patient.edit", "Editar paciente")
P("cln.patient.archive", "Arquivar paciente")
P("cln.appointment.view", "Visualizar agendamentos")
P("cln.appointment.create", "Criar agendamento")
P("cln.appointment.edit", "Editar agendamento")
P("cln.appointment.cancel", "Cancelar agendamento")
P("cln.queue.view", "Visualizar fila de atendimento")
P("cln.queue.manage", "Gerenciar fila de atendimento")
P("cln.consultation.view", "Visualizar consultas")
P("cln.consultation.create", "Registrar consulta")
P("cln.consultation.edit", "Editar consulta")

# ── DGN (Diagnóstico) ────────────────────────────────────────────────────────
# (módulo em reconstrução — permissões serão adicionadas conforme as telas forem criadas)

# ── HSP (Hospitalar) ─────────────────────────────────────────────────────────
# (módulo em reconstrução — permissões serão adicionadas conforme as telas forem criadas)

# ── PLN (Planos) ─────────────────────────────────────────────────────────────
P("pln.insurance.view", "Visualizar convênios")
P("pln.insurance.manage", "Gerenciar convênios")

# ── FSC (Fiscal / VISA) ──────────────────────────────────────────────────────
P("fsc.establishment.view", "Visualizar estabelecimentos")
P("fsc.establishment.manage", "Gerenciar estabelecimentos")
P("fsc.inspection.view", "Visualizar inspeções")
P("fsc.inspection.create", "Registrar inspeção")

# ── OPS (Operações) ──────────────────────────────────────────────────────────
P("ops.report.view", "Visualizar relatórios operacionais")
P("ops.report.export", "Exportar relatórios")
P("ops.vehicle.view", "Visualizar frota")
P("ops.vehicle.manage", "Gerenciar frota")
P("ops.session.view", "Visualizar sessões e presença")
