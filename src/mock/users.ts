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

export const mockUsers: User[] = [
  {
    id: 'usr1',
    name: 'Igor Santos',
    login: 'igor.santos',
    email: 'igor@zsaude.gov.br',
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
    municipalities: [
      {
        municipalityId: 'mun1',
        facilities: [
          { facilityId: 'fac6', role: 'Gestor de Frota', modules: ['ops'] },
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
