import type { User, SystemAccess } from '../types'

export const mockUsers: User[] = [
  { id: 'usr1', name: 'Igor Santos', login: 'igor.santos', email: 'igor@zsaude.gov.br', role: 'Administrador do Sistema', unit: 'Secretaria Municipal de Saúde', systems: ['ga', 'lab', 'aih', 'conv', 'visa', 'adm'] },
  { id: 'usr2', name: 'Carla Mendonça', login: 'carla.mendonca', email: 'carla@zsaude.gov.br', role: 'Recepcionista', unit: 'UBS Centro', systems: ['ga'] },
  { id: 'usr3', name: 'Diego Figueiredo', login: 'diego.figueiredo', email: 'diego@zsaude.gov.br', role: 'Técnico de Lab.', unit: 'Lab. Municipal', systems: ['lab'] },
  { id: 'usr4', name: 'Renata Cabral', login: 'renata.cabral', email: 'renata@zsaude.gov.br', role: 'Fiscal Sanitário', unit: 'VISA Municipal', systems: ['visa'] },
  { id: 'usr5', name: 'Thales Marques', login: 'thales.marques', email: 'thales@zsaude.gov.br', role: 'Gestor de Frota', unit: 'Setor de Transportes', systems: ['adm'] },
]

export const SYSTEMS: SystemAccess[] = [
  { id: 'ga', name: 'Clínica', abbrev: 'CLN', originalName: 'GA – Gestão de Atendimento', description: 'Atendimento ambulatorial, pacientes, prontuário e fila de atendimento', color: '#0ea5e9', icon: 'stethoscope' },
  { id: 'lab', name: 'Diagnóstico', abbrev: 'DGN', originalName: 'LAB – Laboratório', description: 'Exames, coleta, análise e liberação de laudos laboratoriais', color: '#8b5cf6', icon: 'flask-conical' },
  { id: 'aih', name: 'Hospitalar', abbrev: 'HSP', originalName: 'AIH – Autorização de Internação Hospitalar', description: 'Internações, leitos e autorizações hospitalares', color: '#f59e0b', icon: 'bed-double' },
  { id: 'conv', name: 'Planos', abbrev: 'PLN', originalName: 'CONV – Convênios', description: 'Convênios, coberturas e beneficiários de planos de saúde', color: '#10b981', icon: 'shield-check' },
  { id: 'visa', name: 'Fiscal', abbrev: 'FSC', originalName: 'VISA – Vigilância Sanitária', description: 'Vigilância sanitária, alvarás e inspeções de estabelecimentos', color: '#f97316', icon: 'clipboard-check' },
  { id: 'adm', name: 'Operações', abbrev: 'OPS', originalName: 'ADM – Administrativo', description: 'Frota, transporte e logística de saúde', color: '#6b7280', icon: 'truck' },
]

export const mockOnlineUsers = [
  { id: 'usr1', name: 'Igor Santos', role: 'Administrador', unit: 'SMS', system: 'CLN', since: '07:45' },
  { id: 'usr2', name: 'Carla Mendonça', role: 'Recepcionista', unit: 'UBS Centro', system: 'CLN', since: '08:00' },
  { id: 'usr3', name: 'Diego Figueiredo', role: 'Técnico Lab.', unit: 'Lab. Municipal', system: 'DGN', since: '08:15' },
  { id: 'usr6', name: 'Simone Araújo', role: 'Enfermeira', unit: 'UPA Norte', system: 'CLN', since: '08:30' },
  { id: 'usr7', name: 'Rafael Campos', role: 'Médico', unit: 'HMU', system: 'HSP', since: '08:45' },
]
