// ─── System Logs ─────────────────────────────────────────────────────────────

export type LogAction =
  | 'login' | 'logout' | 'login_failed'
  | 'view' | 'create' | 'edit' | 'delete'
  | 'export' | 'print'
  | 'permission_change' | 'password_reset' | 'block_user'

export type LogSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface SystemLog {
  id: string
  hash: string
  userId: string
  userName: string
  action: LogAction
  severity: LogSeverity
  module: string
  resource: string        // tipo do recurso afetado: 'Paciente', 'Agendamento', etc.
  resourceId: string      // id do recurso
  description: string
  details: string         // texto longo com contexto completo
  ip: string
  userAgent: string
  at: Date
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hash() {
  return Math.random().toString(36).slice(2, 10).toUpperCase() +
         Math.random().toString(36).slice(2, 10).toUpperCase()
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000)

// ─── Dados ────────────────────────────────────────────────────────────────────

export const mockSystemLogs: SystemLog[] = [
  // ── Hoje ──────────────────────────────────────────────────────────────────
  {
    id: 'sl001', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'login', severity: 'info', module: 'OPS', resource: 'Sessão', resourceId: 'sess-001',
    description: 'Login realizado com sucesso',
    details: 'Autenticação realizada via CPF. Sessão iniciada com perfil Administrador do Sistema na unidade SMS Central. Token JWT emitido com expiração de 8 horas.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(20),
  },
  {
    id: 'sl002', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'view', severity: 'info', module: 'OPS', resource: 'Usuário', resourceId: 'usr-list',
    description: 'Acessou lista de usuários',
    details: 'Consulta à listagem de usuários do sistema. Retornou 12 registros. Filtros aplicados: nenhum.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(18),
  },
  {
    id: 'sl003', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'create', severity: 'info', module: 'OPS', resource: 'Usuário', resourceId: 'usr12',
    description: 'Cadastrou novo usuário: Juliana Torres',
    details: 'Criação de conta de usuário. Dados: Nome=Juliana Torres, CPF=134.567.890-23, E-mail=juliana@zsaude.gov.br, Perfil=Recepcionista. Senha provisória gerada automaticamente. Acesso configurado para UBS Centro e UPA Norte (módulo CLN).',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(16),
  },
  {
    id: 'sl004', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'permission_change', severity: 'warning', module: 'OPS', resource: 'Usuário', resourceId: 'usr5',
    description: 'Alterou status de Thales Marques para Inativo',
    details: 'Alteração de status de conta. Usuário: Thales Marques (usr5). Status anterior: Ativo. Novo status: Inativo. Motivo informado: Afastamento temporário. Sessões ativas do usuário encerradas imediatamente.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(14),
  },
  {
    id: 'sl005', hash: hash(),
    userId: 'usr2', userName: 'Carla Mendonça',
    action: 'login', severity: 'info', module: 'CLN', resource: 'Sessão', resourceId: 'sess-002',
    description: 'Login realizado com sucesso',
    details: 'Autenticação realizada via CPF. Sessão iniciada com perfil Recepcionista na unidade UBS Centro.',
    ip: '201.73.45.12', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
    at: ago(13),
  },
  {
    id: 'sl006', hash: hash(),
    userId: 'usr2', userName: 'Carla Mendonça',
    action: 'create', severity: 'info', module: 'CLN', resource: 'Agendamento', resourceId: 'appt-881',
    description: 'Criou agendamento para João Pedro Lima',
    details: 'Novo agendamento criado. Paciente: João Pedro Lima (ID: pac-0041). Profissional: Dra. Ana Beatriz Costa. Especialidade: Clínica Geral. Data: 15/04/2026 às 09:30. Tipo: Primeira Vez. Unidade: UBS Centro.',
    ip: '201.73.45.12', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
    at: ago(12),
  },
  {
    id: 'sl007', hash: hash(),
    userId: 'usr3', userName: 'Diego Figueiredo',
    action: 'login', severity: 'info', module: 'DGN', resource: 'Sessão', resourceId: 'sess-003',
    description: 'Login realizado com sucesso',
    details: 'Autenticação realizada via e-mail. Sessão iniciada com perfil Técnico de Laboratório na unidade Lab. Municipal.',
    ip: '187.65.33.201', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/125',
    at: ago(11),
  },
  {
    id: 'sl008', hash: hash(),
    userId: 'usr3', userName: 'Diego Figueiredo',
    action: 'edit', severity: 'info', module: 'DGN', resource: 'Exame', resourceId: 'exam-0219',
    description: 'Atualizou resultado de hemograma completo',
    details: 'Atualização de resultado laboratorial. Solicitação: exam-0219. Paciente: Roberto Alves. Exame: Hemograma Completo. Campos alterados: resultado, status (Coletado → Resultado Liberado). Laudado por: Diego Figueiredo (CRBio-34521).',
    ip: '187.65.33.201', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/125',
    at: ago(9),
  },
  {
    id: 'sl009', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'export', severity: 'info', module: 'CLN', resource: 'Relatório', resourceId: 'rpt-abr-2026',
    description: 'Exportou relatório de produção — Abril/2026',
    details: 'Exportação de relatório de produção ambulatorial. Período: 01/04/2026 a 14/04/2026. Unidade: SMS Central. Formato: XLSX. Total de registros exportados: 1.432. Arquivo gerado: producao_abr2026_20260414.xlsx.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(7),
  },
  {
    id: 'sl010', hash: hash(),
    userId: 'usr8', userName: 'Fernanda Lima',
    action: 'login_failed', severity: 'warning', module: 'CLN', resource: 'Sessão', resourceId: 'sess-fail-001',
    description: 'Tentativa de login falhou — senha incorreta',
    details: 'Tentativa de autenticação malsucedida. Usuário: fernanda@zsaude.gov.br. Motivo: senha incorreta. Tentativa 2 de 5. Conta será bloqueada após 5 tentativas consecutivas. IP registrado para monitoramento.',
    ip: '200.145.22.77', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604',
    at: ago(6),
  },
  {
    id: 'sl011', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'password_reset', severity: 'warning', module: 'OPS', resource: 'Usuário', resourceId: 'usr8',
    description: 'Redefiniu senha de Fernanda Lima',
    details: 'Redefinição de senha administrativa. Usuário afetado: Fernanda Lima (usr8). Executado por: Igor Santos (Administrador). Senha provisória gerada e definida. Usuário deverá alterar no próximo acesso. Sessões anteriores invalidadas.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(5),
  },
  {
    id: 'sl012', hash: hash(),
    userId: 'usr4', userName: 'Renata Cabral',
    action: 'login', severity: 'info', module: 'FSC', resource: 'Sessão', resourceId: 'sess-004',
    description: 'Login realizado com sucesso',
    details: 'Autenticação realizada via CPF. Sessão iniciada com perfil Fiscal Sanitário na unidade VISA Municipal.',
    ip: '177.88.64.33', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Edge/124',
    at: ago(4),
  },
  {
    id: 'sl013', hash: hash(),
    userId: 'usr4', userName: 'Renata Cabral',
    action: 'create', severity: 'info', module: 'FSC', resource: 'Estabelecimento', resourceId: 'estab-0091',
    description: 'Cadastrou inspeção sanitária — Farmácia Popular Centro',
    details: 'Registro de inspeção sanitária. Estabelecimento: Farmácia Popular Centro (CNPJ: 12.345.678/0001-90). Data da inspeção: 14/04/2026. Fiscal responsável: Renata Cabral. Resultado preliminar: Regular. Próxima inspeção agendada para 14/10/2026.',
    ip: '177.88.64.33', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Edge/124',
    at: ago(3),
  },
  {
    id: 'sl014', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'block_user', severity: 'critical', module: 'OPS', resource: 'Usuário', resourceId: 'usr8',
    description: 'Bloqueou conta de Fernanda Lima',
    details: 'Bloqueio administrativo de conta. Usuário: Fernanda Lima (usr8). Executado por: Igor Santos (Administrador). Motivo: múltiplas tentativas de acesso suspeitas detectadas. Todas as sessões ativas encerradas. Acesso ao sistema revogado até revisão manual.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(2),
  },
  {
    id: 'sl015', hash: hash(),
    userId: 'usr9', userName: 'Paulo Henrique',
    action: 'view', severity: 'info', module: 'CLN', resource: 'Paciente', resourceId: 'pac-0099',
    description: 'Visualizou prontuário de Maria Aparecida Souza',
    details: 'Acesso a prontuário eletrônico. Paciente: Maria Aparecida Souza (CNS: 706 0043 2890 0016). Profissional: Paulo Henrique. Seções acessadas: Dados gerais, Histórico de atendimentos, Prescrições. Duração da sessão de visualização: 4 min 32 seg.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(1),
  },

  // ── Ontem ──────────────────────────────────────────────────────────────────
  {
    id: 'sl016', hash: hash(),
    userId: 'usr6', userName: 'Simone Araújo',
    action: 'login', severity: 'info', module: 'CLN', resource: 'Sessão', resourceId: 'sess-006',
    description: 'Login realizado com sucesso',
    details: 'Autenticação via CPF. Sessão iniciada com perfil Enfermeira na unidade UPA Norte.',
    ip: '200.180.55.14', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
    at: ago(1440 + 30),
  },
  {
    id: 'sl017', hash: hash(),
    userId: 'usr6', userName: 'Simone Araújo',
    action: 'edit', severity: 'info', module: 'CLN', resource: 'Triagem', resourceId: 'triagem-0441',
    description: 'Registrou triagem de paciente — risco Urgente',
    details: 'Registro de triagem pelo protocolo Manchester. Paciente: Carlos Eduardo Mota. Queixa principal: Dor torácica. Sinais vitais: PA 145/90 mmHg, FC 98 bpm, SpO2 96%, Temp 37,2°C. Classificação de risco: Urgente (laranja). Tempo de espera máximo: 30 min.',
    ip: '200.180.55.14', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
    at: ago(1440 + 60),
  },
  {
    id: 'sl018', hash: hash(),
    userId: 'usr7', userName: 'Rafael Campos',
    action: 'create', severity: 'info', module: 'HSP', resource: 'Internação', resourceId: 'aih-00881',
    description: 'Abriu AIH para internação — Carlos Eduardo Mota',
    details: 'Autorização de Internação Hospitalar emitida. Paciente: Carlos Eduardo Mota (AIH: 3500112345678). CID: I20.0 – Angina instável. Procedimento: Internação em Cardiologia. Leito: 204-B. Médico solicitante: Dr. Rafael Campos (CRM-GO 18.234).',
    ip: '187.110.44.22', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604',
    at: ago(1440 + 90),
  },
  {
    id: 'sl019', hash: hash(),
    userId: 'usr2', userName: 'Carla Mendonça',
    action: 'edit', severity: 'info', module: 'CLN', resource: 'Paciente', resourceId: 'pac-0041',
    description: 'Atualizou dados cadastrais de João Pedro Lima',
    details: 'Atualização de cadastro de paciente. ID: pac-0041. Campos alterados: telefone celular (anterior: (62) 9 8765-0000 → novo: (62) 9 9123-4567), e-mail (anterior: vazio → novo: joaopedro@gmail.com). Atualizado por: Carla Mendonça.',
    ip: '201.73.45.12', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
    at: ago(1440 + 120),
  },
  {
    id: 'sl020', hash: hash(),
    userId: 'usr10', userName: 'Beatriz Nunes',
    action: 'login_failed', severity: 'error', module: 'CLN', resource: 'Sessão', resourceId: 'sess-fail-002',
    description: 'Tentativa de login falhou — conta inativa',
    details: 'Tentativa de autenticação malsucedida. Usuário: beatriz@zsaude.gov.br. Motivo: conta inativa no sistema. Acesso negado automaticamente. Administrador notificado para revisão do status da conta.',
    ip: '189.92.111.50', userAgent: 'Mozilla/5.0 (Android 14; Mobile) Chrome/124',
    at: ago(1440 + 200),
  },
  {
    id: 'sl021', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'delete', severity: 'critical', module: 'OPS', resource: 'Acesso', resourceId: 'acc-usr11-fac9',
    description: 'Removeu acesso de Marcos Vinicius à UPA Sul',
    details: 'Remoção de vínculo de acesso. Usuário: Marcos Vinicius (usr11). Unidade removida: UPA Sul (fac9). Módulo: HSP. Executado por: Igor Santos. Histórico de atendimentos preservado. Sessões ativas do usuário para esta unidade encerradas.',
    ip: '177.22.104.5', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(1440 + 300),
  },
  {
    id: 'sl022', hash: hash(),
    userId: 'usr3', userName: 'Diego Figueiredo',
    action: 'print', severity: 'info', module: 'DGN', resource: 'Laudo', resourceId: 'laudo-0219',
    description: 'Imprimiu laudo laboratorial — Roberto Alves',
    details: 'Impressão de laudo laboratorial. Solicitação: exam-0219. Paciente: Roberto Alves. Exames incluídos: Hemograma Completo, Glicemia de Jejum, Colesterol Total. Assinado digitalmente por: Diego Figueiredo (CRBio-34521). 1 via impressa.',
    ip: '187.65.33.201', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/125',
    at: ago(1440 + 360),
  },
  {
    id: 'sl023', hash: hash(),
    userId: 'usr4', userName: 'Renata Cabral',
    action: 'export', severity: 'info', module: 'FSC', resource: 'Relatório', resourceId: 'rpt-visa-mar26',
    description: 'Exportou relatório de inspeções VISA — Março/2026',
    details: 'Exportação de relatório de vigilância sanitária. Período: 01/03/2026 a 31/03/2026. Total de inspeções: 47. Estabelecimentos regulares: 38. Irregulares: 7. Interditados: 2. Formato: PDF. Arquivo: inspecoes_visa_mar2026.pdf.',
    ip: '177.88.64.33', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Edge/124',
    at: ago(1440 + 420),
  },
  {
    id: 'sl024', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'logout', severity: 'info', module: 'OPS', resource: 'Sessão', resourceId: 'sess-001',
    description: 'Sessão encerrada',
    details: 'Logout explícito pelo usuário. Sessão ativa por 7h 42min. Todas as permissões temporárias revogadas. Token invalidado.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(1440 + 480),
  },

  // ── 2 dias atrás ──────────────────────────────────────────────────────────
  {
    id: 'sl025', hash: hash(),
    userId: 'usr5', userName: 'Thales Marques',
    action: 'login_failed', severity: 'error', module: 'OPS', resource: 'Sessão', resourceId: 'sess-fail-003',
    description: 'Múltiplas tentativas de login — possível acesso indevido',
    details: 'Detectadas 4 tentativas consecutivas de autenticação malsucedida. Usuário: thales.marques. IPs envolvidos: 200.145.22.77, 201.55.88.12. Possível ataque de força bruta. Conta temporariamente bloqueada por 30 minutos. Evento registrado para auditoria de segurança.',
    ip: '200.145.22.77', userAgent: 'Python-urllib/3.11',
    at: ago(2880 + 50),
  },
  {
    id: 'sl026', hash: hash(),
    userId: 'usr9', userName: 'Paulo Henrique',
    action: 'create', severity: 'info', module: 'CLN', resource: 'Paciente', resourceId: 'pac-0201',
    description: 'Cadastrou novo paciente — Sandra Regina Oliveira',
    details: 'Cadastro de novo paciente no sistema. Nome: Sandra Regina Oliveira. CPF: 874.123.456-00. CNS: 703 0098 4512 0044. Data de nascimento: 12/06/1978. Unidade: UBS Centro. Atendimento: Clínica Geral.',
    ip: '189.40.12.88', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(2880 + 90),
  },
  {
    id: 'sl027', hash: hash(),
    userId: 'usr7', userName: 'Rafael Campos',
    action: 'edit', severity: 'info', module: 'CLN', resource: 'Consulta', resourceId: 'cons-0882',
    description: 'Finalizou prontuário eletrônico — Ana Beatriz Costa',
    details: 'Finalização de prontuário de consulta. Paciente: Ana Beatriz Costa. CID registrado: J06.9 – Infecção aguda das vias aéreas superiores. Prescrição: Amoxicilina 500mg 8/8h por 7 dias, Ibuprofeno 400mg se febre. Encaminhamento: nenhum. Status: Finalizado.',
    ip: '187.110.44.22', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604',
    at: ago(2880 + 130),
  },
  {
    id: 'sl028', hash: hash(),
    userId: 'usr12', userName: 'Juliana Torres',
    action: 'login', severity: 'info', module: 'CLN', resource: 'Sessão', resourceId: 'sess-012',
    description: 'Primeiro login após cadastro',
    details: 'Primeiro acesso ao sistema. Usuário: Juliana Torres. Senha provisória utilizada. Sistema solicitou troca de senha obrigatória. Nova senha definida com sucesso. Sessão iniciada com perfil Recepcionista.',
    ip: '177.22.104.5', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
    at: ago(2880 + 200),
  },
  {
    id: 'sl029', hash: hash(),
    userId: 'usr1', userName: 'Igor Santos',
    action: 'permission_change', severity: 'warning', module: 'OPS', resource: 'Usuário', resourceId: 'usr10',
    description: 'Adicionou acesso de Beatriz Nunes ao módulo PLN',
    details: 'Alteração de permissões de acesso. Usuário: Beatriz Nunes (usr10). Unidade: SMS Aparecida (fac7). Módulo adicionado: PLN (Planos). Permissão concedida por: Igor Santos. Justificativa: ampliação de função — assistente social com acesso a convênios.',
    ip: '177.22.104.5', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
    at: ago(2880 + 260),
  },
  {
    id: 'sl030', hash: hash(),
    userId: 'usr6', userName: 'Simone Araújo',
    action: 'logout', severity: 'info', module: 'CLN', resource: 'Sessão', resourceId: 'sess-006',
    description: 'Sessão encerrada',
    details: 'Logout por timeout de inatividade. Sessão expirada após 30 minutos sem interação. Token invalidado automaticamente.',
    ip: '200.180.55.14', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
    at: ago(2880 + 480),
  },
]
