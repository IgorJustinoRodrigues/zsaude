// HSP — Hospitalar. Cadastro de paciente (com foto + histórico).

import { api, apiFetch } from './client'

// ─── Enums ────────────────────────────────────────────────────────────────

export type Sex = 'M' | 'F' | 'I'
export type PlanoSaudeTipo = 'SUS' | 'PARTICULAR' | 'CONVENIO'
export type PatientFieldChangeType =
  | 'create' | 'update' | 'delete' | 'photo_upload' | 'photo_remove'

// ─── Tipos ───────────────────────────────────────────────────────────────

export interface PatientBaseFields {
  // Identificação
  prontuario?: string | null
  name: string
  socialName: string
  cpf: string
  cns: string | null
  rg: string
  rgOrgaoEmissor: string
  rgUf: string
  rgDataEmissao: string | null
  tipoDocumentoId: string | null
  numeroDocumento: string
  passaporte: string
  paisPassaporte: string
  nisPis: string
  tituloEleitor: string
  cadunico: string

  // Nascimento
  birthDate: string | null
  sex: Sex | null
  naturalidadeIbge: string
  naturalidadeUf: string
  paisNascimento: string
  identidadeGeneroId: string | null
  orientacaoSexualId: string | null

  // Sociodemográfico
  nacionalidadeId: string | null
  racaId: string | null
  etniaId: string | null
  estadoCivilId: string | null
  escolaridadeId: string | null
  religiaoId: string | null
  povoTradicionalId: string | null
  cboId: string | null
  ocupacaoLivre: string
  situacaoRua: boolean
  frequentaEscola: boolean | null
  rendaFamiliar: number | null
  beneficiarioBolsaFamilia: boolean

  // Endereço
  cep: string
  logradouroId: string | null
  endereco: string
  numero: string
  complemento: string
  bairro: string
  municipioIbge: string
  uf: string
  pais: string
  areaMicroarea: string

  // Contato
  phone: string
  cellphone: string
  phoneRecado: string
  email: string
  idiomaPreferencial: string

  // Filiação
  motherName: string
  motherUnknown: boolean
  fatherName: string | null
  fatherUnknown: boolean
  responsavelNome: string
  responsavelCpf: string
  responsavelParentescoId: string | null
  contatoEmergenciaNome: string
  contatoEmergenciaTelefone: string
  contatoEmergenciaParentescoId: string | null

  // Clínico
  tipoSanguineoId: string | null
  alergias: string
  temAlergia: boolean
  doencasCronicas: string
  deficiencias: string[]
  gestante: boolean
  dum: string | null
  fumante: boolean | null
  etilista: boolean | null
  observacoesClinicas: string

  // Convênio
  planoTipo: PlanoSaudeTipo
  convenioNome: string
  convenioNumeroCarteirinha: string
  convenioValidade: string | null

  // Metadados
  unidadeSaudeId: string | null
  vinculado: boolean
  observacoes: string
  consentimentoLgpd: boolean
}

export type PatientCreate = Partial<PatientBaseFields> & {
  name: string
  cpf: string
  prontuario?: string
}

export type PatientUpdate = Partial<PatientBaseFields> & {
  reason?: string
}

export interface PatientRead extends PatientBaseFields {
  id: string
  active: boolean
  importado: boolean
  dataObito: string | null
  dataUltimaRevisaoCadastro: string | null
  dataConsentimentoLgpd: string | null
  currentPhotoId: string | null
  hasPhoto: boolean
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PatientListItem {
  id: string
  prontuario: string
  name: string
  socialName: string
  cpf: string
  cns: string | null
  birthDate: string | null
  sex: Sex | null
  cellphone: string
  phone: string
  active: boolean
  hasPhoto: boolean
  createdAt: string
  updatedAt: string
}

export interface PatientFieldHistoryItem {
  id: string
  patientId: string
  fieldName: string
  oldValue: string | null
  newValue: string | null
  changeType: PatientFieldChangeType
  changedBy: string | null
  changedByName: string
  changedByRole: string
  reason: string
  changedAt: string
}

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface PatientListParams {
  search?: string
  active?: boolean
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    s.set(k, String(v))
  }
  const str = s.toString()
  return str ? `?${str}` : ''
}

// ─── API ─────────────────────────────────────────────────────────────────

export const hspApi = {
  list: (params: PatientListParams = {}) =>
    api.get<PageResponse<PatientListItem>>(
      `/api/v1/hsp/patients${qs({ ...params })}`,
      { withContext: true },
    ),

  get: (id: string) =>
    api.get<PatientRead>(`/api/v1/hsp/patients/${id}`, { withContext: true }),

  create: (payload: PatientCreate) =>
    apiFetch<PatientRead>('/api/v1/hsp/patients', {
      method: 'POST',
      body: payload,
      withContext: true,
    }),

  update: (id: string, payload: PatientUpdate) =>
    apiFetch<PatientRead>(`/api/v1/hsp/patients/${id}`, {
      method: 'PATCH',
      body: payload,
      withContext: true,
    }),

  remove: (id: string, reason?: string) =>
    apiFetch<void>(
      `/api/v1/hsp/patients/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`,
      { method: 'DELETE', withContext: true },
    ),

  // ── Foto ──────────────────────────────────────────
  uploadPhoto: async (id: string, file: File | Blob, meta?: { width?: number; height?: number }) => {
    const fd = new FormData()
    fd.append('file', file, (file as File).name ?? 'photo.jpg')
    if (meta?.width)  fd.append('width',  String(meta.width))
    if (meta?.height) fd.append('height', String(meta.height))
    return apiFetch<PatientRead>(`/api/v1/hsp/patients/${id}/photo`, {
      method: 'POST',
      body: fd,
      withContext: true,
    })
  },

  photoUrl: (id: string, photoId?: string) =>
    photoId
      ? `/api/v1/hsp/patients/${id}/photos/${photoId}`
      : `/api/v1/hsp/patients/${id}/photo`,

  removePhoto: (id: string) =>
    apiFetch<void>(`/api/v1/hsp/patients/${id}/photo`, {
      method: 'DELETE', withContext: true,
    }),

  // ── Histórico ─────────────────────────────────────
  listHistory: (id: string, params: { field?: string; page?: number; pageSize?: number } = {}) =>
    api.get<PageResponse<PatientFieldHistoryItem>>(
      `/api/v1/hsp/patients/${id}/history${qs({ ...params })}`,
      { withContext: true },
    ),
}
