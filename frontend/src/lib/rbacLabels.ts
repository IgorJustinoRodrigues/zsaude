// Rótulos em PT-BR para as entidades do RBAC.
// Centralizado pra evitar inglês vazando na UI.

export const MODULE_LABELS: Record<string, string> = {
  sys:    'Sistema',
  users:  'Usuários',
  roles:  'Perfis',
  audit:  'Auditoria',
  ai:     'Inteligência Artificial',
  cln:    'Clínica',
  dgn:    'Diagnóstico',
  hsp:    'Hospitalar',
  pln:    'Planos',
  fsc:    'Fiscal',
  ops:    'Operações',
  ind:    'Indicadores',
  rec:    'Recepção',
  esu:    'Integra e-SUS',
}

export const RESOURCE_LABELS: Record<string, string> = {
  patient:         'Pacientes',
  patient_photo:   'Foto do paciente',
  patient_history: 'Histórico do paciente',
  face:            'Reconhecimento facial',
  photo:           'Foto',
  appointment:     'Agendamentos',
  queue:           'Fila de atendimento',
  consultation:    'Consultas',
  exam:            'Exames',
  result:          'Resultados',
  log:             'Logs',
  user:            'Usuários',
  access:          'Acessos',
  role:            'Perfis',
  permission:      'Permissões',
  override:        'Personalizações',
  municipality:    'Municípios',
  facility:        'Unidades',
  setting:         'Configurações',
  session:         'Sessões',
  report:          'Relatórios',
  import:          'Importações',
  vehicle:         'Frota',
  insurance:       'Convênios',
  establishment:   'Estabelecimentos',
  inspection:      'Inspeções',
  operations:      'Operações de IA',
  module:          'Módulo',
}

export const ACTION_LABELS: Record<string, string> = {
  view:           'Visualizar',
  create:         'Criar',
  edit:           'Editar',
  delete:         'Excluir',
  archive:        'Arquivar',
  unarchive:      'Reativar',
  reset_password: 'Redefinir senha',
  manage:         'Gerenciar',
  assign:         'Atribuir',
  export:         'Exportar',
  request:        'Solicitar',
  collect:        'Registrar coleta',
  release:        'Liberar',
  cancel:         'Cancelar',
  face_match:     'Identificar por face',
  reindex:        'Reindexar',
  upload:         'Enviar',
  use:            'Utilizar',
  execute:        'Executar',
  access:         'Acessar',
}

export const SCOPE_LABELS: Record<string, string> = {
  SYSTEM:       'Plataforma',
  MUNICIPALITY: 'Município',
}

// Helpers com fallback: se não tiver tradução, retorna o original
// capitalizado / com underscores convertidos pra espaço.
export function moduleLabel(code: string): string {
  return MODULE_LABELS[code] ?? code.toUpperCase()
}

export function resourceLabel(code: string): string {
  return RESOURCE_LABELS[code] ?? capitalize(code)
}

export function actionLabel(code: string): string {
  return ACTION_LABELS[code] ?? capitalize(code.replace(/_/g, ' '))
}

export function scopeLabel(code: string): string {
  return SCOPE_LABELS[code] ?? code
}

function capitalize(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}
