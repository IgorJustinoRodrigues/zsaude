import type { User, SystemAccess, Municipality, Facility } from '../types'

// ─── Municipalities ───────────────────────────────────────────────────────────

export const mockMunicipalities: Municipality[] = [
  { id: 'mun1', name: 'Goiânia',               state: 'GO', ibge: '5208707' },
  { id: 'mun2', name: 'Aparecida de Goiânia',  state: 'GO', ibge: '5201405' },
  { id: 'mun3', name: 'Anápolis',              state: 'GO', ibge: '5201108' },
]

// ─── Facilities ───────────────────────────────────────────────────────────────

export const mockFacilities: Facility[] = [
  // Goiânia
  { id: 'fac1', name: 'Secretaria Municipal de Saúde',  shortName: 'SMS Central',      type: 'SMS',       municipalityId: 'mun1' },
  { id: 'fac2', name: 'UBS Centro',                     shortName: 'UBS Centro',        type: 'UBS',       municipalityId: 'mun1' },
  { id: 'fac3', name: 'UPA Norte',                      shortName: 'UPA Norte',         type: 'UPA',       municipalityId: 'mun1' },
  { id: 'fac4', name: 'Laboratório Municipal',           shortName: 'Lab. Municipal',    type: 'Lab',       municipalityId: 'mun1' },
  { id: 'fac5', name: 'VISA Municipal',                  shortName: 'VISA Municipal',    type: 'VISA',      municipalityId: 'mun1' },
  { id: 'fac6', name: 'Setor de Transportes',            shortName: 'Transportes',       type: 'Transportes', municipalityId: 'mun1' },
  // Aparecida de Goiânia
  { id: 'fac7', name: 'Secretaria Municipal de Saúde',  shortName: 'SMS Aparecida',     type: 'SMS',       municipalityId: 'mun2' },
  { id: 'fac8', name: 'UBS Jardim Tiradentes',          shortName: 'UBS Jardim',        type: 'UBS',       municipalityId: 'mun2' },
  { id: 'fac9', name: 'UPA Sul',                        shortName: 'UPA Sul',           type: 'UPA',       municipalityId: 'mun2' },
  // Anápolis
  { id: 'fac10', name: 'Secretaria Municipal de Saúde', shortName: 'SMS Anápolis',      type: 'SMS',       municipalityId: 'mun3' },
  { id: 'fac11', name: 'HMU – Hospital Municipal',      shortName: 'HMU',               type: 'Hospital',  municipalityId: 'mun3' },
]

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserStatus = 'Ativo' | 'Inativo' | 'Bloqueado'

export interface UserRecord extends User {
  cpf: string
  phone: string
  status: UserStatus
  createdAt: string
  primaryRole: string
}

export const mockUsers: UserRecord[] = [
  {
    id: 'usr1',
    name: 'Igor Santos',
    login: 'igor.santos',
    email: 'igor@zsaude.gov.br',
    cpf: '021.345.678-90',
    phone: '(62) 99999-1234',
    status: 'Ativo',
    createdAt: '2023-01-10',
    primaryRole: 'Administrador do Sistema',
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac1', role: 'Administrador do Sistema', modules: ['cln', 'dgn', 'hsp', 'pln', 'fsc', 'ops'] },
          { facilityId: 'fac2', role: 'Supervisor Clínico',       modules: ['cln', 'dgn'] },
          { facilityId: 'fac3', role: 'Supervisor UPA',           modules: ['cln', 'hsp'] },
        ],
      },
      {
        municipalityId: 'mun2',
        facilities: [
          { facilityId: 'fac7', role: 'Consultor Externo',        modules: ['cln', 'pln'] },
          { facilityId: 'fac8', role: 'Analista',                 modules: ['cln'] },
        ],
      },
      {
        municipalityId: 'mun3',
        facilities: [
          { facilityId: 'fac10', role: 'Gestor Regional',         modules: ['cln', 'dgn', 'hsp', 'pln'] },
        ],
      },
    ],
  },
  {
    id: 'usr2',
    name: 'Carla Mendonça',
    login: 'carla.mendonca',
    email: 'carla@zsaude.gov.br',
    cpf: '134.567.890-12',
    phone: '(62) 98888-5678',
    status: 'Ativo',
    createdAt: '2023-03-15',
    primaryRole: 'Recepcionista',
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac2', role: 'Recepcionista', modules: ['cln'] },
        ],
      },
    ],
  },
  {
    id: 'usr3',
    name: 'Diego Figueiredo',
    login: 'diego.figueiredo',
    email: 'diego@zsaude.gov.br',
    cpf: '245.678.901-23',
    phone: '(62) 97777-9012',
    status: 'Ativo',
    createdAt: '2023-02-20',
    primaryRole: 'Técnico de Laboratório',
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac4', role: 'Técnico de Laboratório', modules: ['dgn'] },
        ],
      },
    ],
  },
  {
    id: 'usr4',
    name: 'Renata Cabral',
    login: 'renata.cabral',
    email: 'renata@zsaude.gov.br',
    cpf: '356.789.012-34',
    phone: '(62) 96666-3456',
    status: 'Ativo',
    createdAt: '2023-04-05',
    primaryRole: 'Fiscal Sanitário',
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac5', role: 'Fiscal Sanitário', modules: ['fsc'] },
        ],
      },
    ],
  },
  {
    id: 'usr5',
    name: 'Thales Marques',
    login: 'thales.marques',
    email: 'thales@zsaude.gov.br',
    cpf: '467.890.123-45',
    phone: '(62) 95555-7890',
    status: 'Inativo',
    createdAt: '2023-01-28',
    primaryRole: 'Gestor de Frota',
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac6', role: 'Gestor de Frota', modules: ['ops'] },
        ],
      },
    ],
  },
  {
    id: 'usr6',
    name: 'Simone Araújo',
    login: 'simone.araujo',
    email: 'simone@zsaude.gov.br',
    cpf: '578.901.234-56',
    phone: '(62) 94444-1234',
    status: 'Ativo',
    createdAt: '2023-05-12',
    primaryRole: 'Enfermeira',
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac3', role: 'Enfermeira', modules: ['cln', 'hsp'] },
        ],
      },
    ],
  },
  {
    id: 'usr7',
    name: 'Rafael Campos',
    login: 'rafael.campos',
    email: 'rafael@zsaude.gov.br',
    cpf: '689.012.345-67',
    phone: '(62) 93333-5678',
    status: 'Ativo',
    createdAt: '2022-11-08',
    primaryRole: 'Médico',
    municipalities: [
      {
        municipalityId: 'mun3',
        facilities: [
          { facilityId: 'fac11', role: 'Médico', modules: ['cln', 'hsp'] },
        ],
      },
    ],
  },
  {
    id: 'usr8',
    name: 'Fernanda Lima',
    login: 'fernanda.lima',
    email: 'fernanda@zsaude.gov.br',
    cpf: '790.123.456-78',
    phone: '(62) 92222-9012',
    status: 'Bloqueado',
    createdAt: '2023-06-01',
    primaryRole: 'Médica',
    municipalities: [
      {
        municipalityId: 'mun2',
        facilities: [
          { facilityId: 'fac9', role: 'Médica', modules: ['cln'] },
        ],
      },
    ],
  },
  {
    id: 'usr9',
    name: 'Paulo Henrique',
    login: 'paulo.henrique',
    email: 'paulo@zsaude.gov.br',
    cpf: '801.234.567-89',
    phone: '(62) 91111-3456',
    status: 'Ativo',
    createdAt: '2023-07-19',
    primaryRole: 'Farmacêutico',
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac2', role: 'Farmacêutico', modules: ['cln', 'ops'] },
        ],
      },
    ],
  },
  {
    id: 'usr10',
    name: 'Beatriz Nunes',
    login: 'beatriz.nunes',
    email: 'beatriz@zsaude.gov.br',
    cpf: '912.345.678-90',
    phone: '(62) 90000-7890',
    status: 'Ativo',
    createdAt: '2023-08-03',
    primaryRole: 'Assistente Social',
    municipalities: [
      {
        municipalityId: 'mun2',
        facilities: [
          { facilityId: 'fac8', role: 'Assistente Social', modules: ['cln', 'pln'] },
        ],
      },
      {
        municipalityId: 'mun3',
        facilities: [
          { facilityId: 'fac10', role: 'Assistente Social', modules: ['cln'] },
        ],
      },
    ],
  },
  {
    id: 'usr11',
    name: 'Marcos Vinicius',
    login: 'marcos.vinicius',
    email: 'marcos@zsaude.gov.br',
    cpf: '023.456.789-01',
    phone: '(62) 98765-4321',
    status: 'Inativo',
    createdAt: '2022-09-14',
    primaryRole: 'Técnico de Enfermagem',
    municipalities: [
      {
        municipalityId: 'mun2',
        facilities: [
          { facilityId: 'fac9', role: 'Técnico de Enfermagem', modules: ['hsp'] },
        ],
      },
    ],
  },
  {
    id: 'usr12',
    name: 'Juliana Torres',
    login: 'juliana.torres',
    email: 'juliana@zsaude.gov.br',
    cpf: '134.567.890-23',
    phone: '(62) 99876-5432',
    status: 'Ativo',
    createdAt: '2023-09-22',
    primaryRole: 'Recepcionista',
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac2', role: 'Recepcionista', modules: ['cln'] },
          { facilityId: 'fac3', role: 'Recepcionista', modules: ['cln'] },
        ],
      },
    ],
  },
]

// ─── Systems ──────────────────────────────────────────────────────────────────

export const SYSTEMS: SystemAccess[] = [
  { id: 'cln', name: 'Clínica',     abbrev: 'CLN', originalName: 'CLN – Clínica',              description: 'Atendimento ambulatorial, pacientes, prontuário e fila de atendimento', color: '#0ea5e9', icon: 'stethoscope' },
  { id: 'dgn', name: 'Diagnóstico', abbrev: 'DGN', originalName: 'DGN – Diagnóstico',          description: 'Exames, coleta, análise e liberação de laudos laboratoriais',           color: '#8b5cf6', icon: 'flask-conical' },
  { id: 'hsp', name: 'Hospitalar',  abbrev: 'HSP', originalName: 'HSP – Hospitalar',           description: 'Internações, leitos e autorizações hospitalares',                        color: '#f59e0b', icon: 'bed-double' },
  { id: 'pln', name: 'Planos',      abbrev: 'PLN', originalName: 'PLN – Planos',               description: 'Convênios, coberturas e beneficiários de planos de saúde',               color: '#10b981', icon: 'shield-check' },
  { id: 'fsc', name: 'Fiscal',      abbrev: 'FSC', originalName: 'FSC – Fiscal Sanitário',     description: 'Vigilância sanitária, alvarás e inspeções de estabelecimentos',          color: '#f97316', icon: 'clipboard-check' },
  { id: 'ops', name: 'Operações',   abbrev: 'OPS', originalName: 'OPS – Operações',            description: 'Frota, transporte e logística de saúde',                                 color: '#6b7280', icon: 'truck' },
]

// ─── User presence (display only) ────────────────────────────────────────────

export type UserPresence = {
  id: string
  name: string
  role: string
  unit: string
  system: string
  online: boolean
  since?: string
  lastSeenAt?: Date
}

const h = (hours: number) => new Date(Date.now() - hours * 3_600_000)
const m = (mins: number)  => new Date(Date.now() - mins  *    60_000)

export const mockAllUsersPresence: UserPresence[] = [
  // ── Online ──────────────────────────────────────────────────────────────────
  { id: 'usr1',  name: 'Igor Santos',       role: 'Administrador',      unit: 'SMS Central',       system: 'CLN', online: true,  since: '07:45' },
  { id: 'usr2',  name: 'Carla Mendonça',    role: 'Recepcionista',      unit: 'UBS Centro',        system: 'CLN', online: true,  since: '08:00' },
  { id: 'usr3',  name: 'Diego Figueiredo',  role: 'Técnico Lab.',       unit: 'Lab. Municipal',    system: 'DGN', online: true,  since: '08:15' },
  { id: 'usr6',  name: 'Simone Araújo',     role: 'Enfermeira',         unit: 'UPA Norte',         system: 'CLN', online: true,  since: '08:30' },
  { id: 'usr7',  name: 'Rafael Campos',     role: 'Médico',             unit: 'HMU',               system: 'HSP', online: true,  since: '08:45' },
  // ── Offline ─────────────────────────────────────────────────────────────────
  { id: 'usr4',  name: 'Renata Cabral',     role: 'Fiscal Sanitário',   unit: 'VISA Municipal',    system: 'FSC', online: false, lastSeenAt: m(45) },
  { id: 'usr12', name: 'Juliana Torres',    role: 'Recepcionista',      unit: 'UBS Norte',         system: 'CLN', online: false, lastSeenAt: h(1)  },
  { id: 'usr5',  name: 'Thales Marques',    role: 'Gestor de Frota',    unit: 'Transportes',       system: 'OPS', online: false, lastSeenAt: h(2)  },
  { id: 'usr8',  name: 'Fernanda Lima',     role: 'Médica',             unit: 'UBS Sul',           system: 'CLN', online: false, lastSeenAt: h(3)  },
  { id: 'usr11', name: 'Marcos Vinicius',   role: 'Téc. Enfermagem',    unit: 'UPA Sul',           system: 'HSP', online: false, lastSeenAt: h(5)  },
  { id: 'usr9',  name: 'Paulo Henrique',    role: 'Farmacêutico',       unit: 'CAF Municipal',     system: 'OPS', online: false, lastSeenAt: h(7)  },
  { id: 'usr10', name: 'Beatriz Nunes',     role: 'Assistente Social',  unit: 'CRAS Centro',       system: 'CLN', online: false, lastSeenAt: h(9)  },
  { id: 'usr13', name: 'André Monteiro',    role: 'Biomédico',          unit: 'Lab. Municipal',    system: 'DGN', online: false, lastSeenAt: h(12) },
  { id: 'usr14', name: 'Patrícia Souza',    role: 'Coordenadora',       unit: 'SMS Central',       system: 'PLN', online: false, lastSeenAt: h(18) },
  { id: 'usr15', name: 'Carlos Eduardo',    role: 'Motorista',          unit: 'Transportes',       system: 'OPS', online: false, lastSeenAt: h(24) },
]

export const mockOnlineUsers = mockAllUsersPresence.filter(u => u.online)
