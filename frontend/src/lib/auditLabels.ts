/**
 * Tradução PT-BR dos códigos técnicos dos audit logs do backend.
 *
 * Os logs são gravados com `action`/`module`/`severity` em snake_case/english
 * (ex: `patient_create`, `hsp`, `info`). Para exibição ao usuário final,
 * sempre converter via estes helpers.
 */

// ── Severidade ──────────────────────────────────────────────────────────────

export const SEVERITY_LABELS: Record<string, string> = {
  info:     'Informativo',
  warning:  'Atenção',
  error:    'Erro',
  critical: 'Crítico',
}

export function labelSeverity(sev: string): string {
  return SEVERITY_LABELS[sev] ?? sev
}

// ── Módulos ─────────────────────────────────────────────────────────────────

export const MODULE_LABELS: Record<string, string> = {
  // Lowercase (padrão novo)
  hsp:         'Hospitalar',
  cln:         'Clínica',
  dgn:         'Diagnóstico',
  pln:         'Planos',
  fsc:         'Fiscal',
  ops:         'Operações',
  ind:         'Indicadores',
  rec:         'Recepção',
  esu:         'Integração eSUS',
  sys:         'Sistema',
  auth:        'Autenticação',
  users:       'Usuários',
  tenants:     'Municípios e Unidades',
  roles:       'Perfis e Permissões',
  audit:       'Auditoria',
  ai:          'Inteligência Artificial',
  sigtap:      'SIGTAP',
  cnes:        'CNES',
  reference:   'Tabelas de Referência',
  system:      'Configurações',
  permissions: 'Permissões',
  // Uppercase (compatibilidade com logs antigos)
  HSP:         'Hospitalar',
  SYS:         'Sistema',
  OPS:         'Operações',
  AUTH:        'Autenticação',
}

export function labelModule(mod: string): string {
  return MODULE_LABELS[mod] ?? MODULE_LABELS[mod?.toLowerCase()] ?? mod
}

// ── Ações ───────────────────────────────────────────────────────────────────

export const ACTION_LABELS: Record<string, string> = {
  // Auth
  login:                      'Entrou',
  login_failed:               'Falha de entrada',
  logout:                     'Saiu',

  // Paciente (CRUD)
  patient_create:             'Cadastro de paciente',
  patient_update:             'Edição de paciente',
  patient_deactivate:         'Desativação de paciente',
  patient_reactivate:         'Reativação de paciente',

  // Paciente (leitura PHI)
  patient_view:               'Consulta a prontuário',
  patient_search:             'Busca de pacientes',
  patient_lookup:             'Consulta pré-cadastro',
  patient_history_view:       'Consulta ao histórico',

  // Foto
  patient_photo_upload:       'Upload de foto',
  patient_photo_remove:       'Remoção de foto',
  patient_photo_restore:      'Restauração de foto',
  patient_photo_download:     'Download de foto',
  patient_photos_list:        'Listagem de fotos',

  // Face
  face_match:                 'Reconhecimento facial',
  face_embedding_delete:      'Remoção de reconhecimento',
  face_reindex:               'Reindexação facial',

  // CadSUS / externo
  cadsus_search:              'Pesquisa no CadSUS',

  // Usuários
  user_create:                'Cadastro de usuário',
  user_edit:                  'Edição de usuário',
  user_update:                'Edição de usuário',
  user_self_update:           'Atualização do próprio perfil',
  user_delete:                'Exclusão de usuário',
  user_activate:              'Ativação de usuário',
  user_deactivate:            'Desativação de usuário',
  user_block:                 'Bloqueio de usuário',
  user_reset_password:        'Reset de senha',
  user_photo_upload:          'Upload de foto de usuário',
  user_photo_remove:          'Remoção de foto de usuário',
  user_photo_restore:         'Restauração de foto de usuário',
  user_face_embedding_delete: 'Remoção de reconhecimento facial do usuário',
  user_face_match:            'Reconhecimento facial de usuário',

  // Perfis e permissões
  role_create:                'Cadastro de perfil',
  role_edit:                  'Edição de perfil',
  role_update:                'Edição de perfil',
  role_delete:                'Arquivamento de perfil',
  role_archive:               'Arquivamento de perfil',
  role_unarchive:             'Reativação de perfil',
  override_set:               'Permissões personalizadas',

  // Municípios e unidades
  municipality_create:        'Cadastro de município',
  municipality_update:        'Edição de município',
  municipality_archive:       'Arquivamento de município',
  municipality_unarchive:     'Reativação de município',
  facility_create:            'Cadastro de unidade',
  facility_update:            'Edição de unidade',
  facility_archive:           'Arquivamento de unidade',
  facility_unarchive:         'Reativação de unidade',
  select_context:             'Entrou no sistema',
  permission_override:        'Ajuste de permissões',
  edit:                       'Edição',
  delete:                     'Arquivamento',

  // Importações
  sigtap_import:              'Importação SIGTAP',
  cnes_import:                'Importação CNES',

  // Referência
  reference_create:           'Cadastro em tabela de referência',
  reference_update:           'Edição em tabela de referência',
  reference_delete:           'Remoção em tabela de referência',

  // Sistema
  setting_update:             'Alteração de configuração',

  // Genéricos
  view:                       'Visualização',
  create:                     'Criação',
  export:                     'Exportação',
  print:                      'Impressão',
  permission_change:          'Mudança de permissão',
  password_reset:             'Reset de senha',
  block_user:                 'Bloqueio de usuário',
}

export function labelAction(action: string): string {
  return ACTION_LABELS[action] ?? humanizeAction(action)
}

/** Fallback genérico: ``patient_export_pdf`` → ``Patient export pdf`` */
function humanizeAction(raw: string): string {
  if (!raw) return '—'
  const s = raw.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Campo "Recurso" ─────────────────────────────────────────────────────────

export const RESOURCE_LABELS: Record<string, string> = {
  patient:           'Paciente',
  patient_photo:     'Foto do paciente',
  user:              'Usuário',
  role:              'Perfil',
  municipality:      'Município',
  facility:          'Unidade',
  cadsus:            'CadSUS',
  face_index:        'Índice facial',
  sigtap_import:     'Importação SIGTAP',
  cnes_import:       'Importação CNES',
  setting:           'Configuração',
  session:           'Sessão',
  Patient:           'Paciente',
  User:              'Usuário',
  Role:              'Perfil',
  Municipality:      'Município',
  Facility:          'Unidade',
  FaceIndex:         'Índice facial',
}

export function labelResource(resource: string): string {
  return RESOURCE_LABELS[resource] ?? RESOURCE_LABELS[resource?.toLowerCase()] ?? resource
}
