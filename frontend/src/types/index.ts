// ─── Auth ────────────────────────────────────────────────────────────────────

export type SystemId = 'cln' | 'dgn' | 'hsp' | 'pln' | 'fsc' | 'ops'

export interface SystemAccess {
  id: SystemId
  name: string
  abbrev: string
  originalName: string
  description: string
  color: string
  icon: string
}

// ─── Multi-tenant access control ─────────────────────────────────────────────

export interface Municipality {
  id: string
  name: string
  state: string
  ibge?: string
}

export interface Facility {
  id: string
  name: string
  shortName: string
  type: string
  municipalityId: string
}

export interface FacilityAccess {
  facilityId: string
  role: string
  modules: SystemId[]
}

export interface MunicipalityAccess {
  municipalityId: string
  facilities: FacilityAccess[]
}

/** The currently active municipality + facility + role + modules */
export interface WorkContext {
  municipality: Municipality
  facility: Facility
  role: string
  modules: SystemId[]
}

export interface User {
  id: string
  name: string
  login: string
  email: string
  municipalities: MunicipalityAccess[]
  avatar?: string
}

// ─── Units ───────────────────────────────────────────────────────────────────

export interface Unit {
  id: string
  name: string
  shortName: string
  cnes: string
  ibge: string
  city: string
  state: string
  address: string
  phone: string
  type: 'UBS' | 'UPA' | 'Hospital' | 'Policlínica' | 'CEO' | 'CAPS'
  active: boolean
}

// ─── Patients ─────────────────────────────────────────────────────────────────

export type Sex = 'M' | 'F'
export type Race = 'Branca' | 'Preta' | 'Parda' | 'Amarela' | 'Indígena'
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'

export interface Patient {
  id: string
  prontuario: string
  name: string
  cpf: string
  cns: string
  birthDate: string
  sex: Sex
  race: Race
  bloodType?: BloodType
  motherName: string
  fatherName?: string
  phone: string
  cellPhone?: string
  email?: string
  address: Address
  unit: string
  nationality: string
  active: boolean
  photo?: string
  createdAt: string
}

export interface Address {
  cep: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}

// ─── Professionals ────────────────────────────────────────────────────────────

export interface Professional {
  id: string
  name: string
  cpf: string
  cns: string
  cbo: string
  cboDescription: string
  specialty: string
  councilType: 'CRM' | 'COREN' | 'CRO' | 'CRF' | 'CREFITO' | 'CFP' | 'CFF'
  councilNumber: string
  councilState: string
  units: string[]
  phone: string
  email: string
  active: boolean
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentType = 'Primeira Vez' | 'Retorno' | 'Reserva'
export type AppointmentStatus =
  | 'Agendado'
  | 'Confirmado'
  | 'Aguardando'
  | 'Em Atendimento'
  | 'Atendido'
  | 'Ausente'
  | 'Cancelado'

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  professionalId: string
  professionalName: string
  specialty: string
  unitId: string
  unitName: string
  date: string
  time: string
  type: AppointmentType
  status: AppointmentStatus
  sector: string
  notes?: string
  createdAt: string
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export type QueueStatus = 'Aguardando' | 'Em Triagem' | 'Em Atendimento' | 'Atendido' | 'Ausente'
export type TriageRisk = 'Imediato' | 'Muito Urgente' | 'Urgente' | 'Pouco Urgente' | 'Não Urgente'

export interface QueueEntry {
  id: string
  ticket: string
  patientId: string
  patientName: string
  patientAge: number
  sector: string
  arrivalTime: string
  callTime?: string
  status: QueueStatus
  triageRisk?: TriageRisk
  priority: boolean
  waitMinutes: number
}

// ─── Triage ───────────────────────────────────────────────────────────────────

export interface TriageData {
  id: string
  patientId: string
  appointmentId: string
  professionalId: string
  date: string
  time: string
  temperature?: number
  bloodPressureSystolic?: number
  bloodPressureDiastolic?: number
  heartRate?: number
  respiratoryRate?: number
  oxygenSaturation?: number
  weight?: number
  height?: number
  bmi?: number
  pain?: number
  chiefComplaint: string
  risk: TriageRisk
  notes?: string
}

// ─── Consultation (Prontuário) ────────────────────────────────────────────────

export interface Consultation {
  id: string
  patientId: string
  professionalId: string
  professionalName: string
  unitId: string
  date: string
  time: string
  type: AppointmentType
  subjective: string
  objective: string
  assessment: string
  cidCode: string
  cidDescription: string
  plan: string
  prescription?: string
  referrals?: string[]
  status: 'Rascunho' | 'Finalizado'
}

// ─── Insurance (Convênios) ────────────────────────────────────────────────────

export type InsuranceStatus = 'Ativo' | 'Suspenso' | 'Encerrado'

export interface Insurance {
  id: string
  name: string
  code: string
  type: 'SUS' | 'IPASGO' | 'Unimed' | 'Bradesco' | 'Amil' | 'Particular'
  status: InsuranceStatus
  validFrom: string
  validTo?: string
  proceduresCount: number
  beneficiariesCount: number
}


// ─── VISA - Establishments ────────────────────────────────────────────────────

export type EstablishmentStatus = 'Regular' | 'Irregular' | 'Interditado' | 'Cancelado'
export type LicenseStatus = 'Válido' | 'Vencido' | 'Pendente' | 'Cancelado'

export interface Establishment {
  id: string
  name: string
  cnpj: string
  type: string
  address: Address
  phone: string
  responsible: string
  licenseNumber: string
  licenseStatus: LicenseStatus
  licenseExpiry: string
  status: EstablishmentStatus
  lastInspection?: string
}

// ─── Fleet / ADM ─────────────────────────────────────────────────────────────

export type VehicleStatus = 'Disponível' | 'Em Uso' | 'Manutenção' | 'Inativo'

export interface Vehicle {
  id: string
  plate: string
  brand: string
  model: string
  year: number
  color: string
  type: string
  capacity: number
  status: VehicleStatus
  driver?: string
  km: number
  lastMaintenance?: string
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  createdAt: string
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface StatCard {
  label: string
  value: number | string
  delta?: number
  deltaLabel?: string
  icon: string
  color: string
}
