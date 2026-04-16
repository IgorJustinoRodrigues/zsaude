// HSP — Hospitalar. Cadastro de paciente (com foto + histórico).

import { api, apiFetch } from './client'

// ─── Enums ────────────────────────────────────────────────────────────────

export type Sex = 'M' | 'F' | 'I'
export type PlanoSaudeTipo = 'SUS' | 'PARTICULAR' | 'CONVENIO'
export type PatientFieldChangeType =
  | 'create' | 'update' | 'delete'
  | 'photo_upload' | 'photo_remove'
  | 'document_add' | 'document_update' | 'document_remove'

// ─── Tipos ───────────────────────────────────────────────────────────────

export interface PatientBaseFields {
  // Identificação
  prontuario?: string | null
  name: string
  socialName: string
  cpf: string | null
  cns: string | null
  // Demais documentos vivem em `documents[]` no PatientRead/PatientUpdate.

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
  latitude: number | null
  longitude: number | null

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

export interface PatientDocumentInput {
  /** Quando vier, atualiza; senão cria. */
  id?: string
  tipoDocumentoId: string | null
  tipoCodigo: string
  numero: string
  orgaoEmissor: string
  ufEmissor: string
  paisEmissor: string
  dataEmissao: string | null
  dataValidade: string | null
  observacao: string
}

export interface PatientDocument extends PatientDocumentInput {
  id: string
  patientId: string
  createdAt: string
  updatedAt: string
}

/**
 * Estado completo do form (todos os campos presentes). É o que o componente
 * mantém em state — fácil de trabalhar (sem `??` em toda parte). É
 * compatível com PatientCreate/PatientUpdate.
 */
export interface PatientFormData extends PatientBaseFields {
  documents: PatientDocumentInput[]
}

/**
 * Campos válidos para Create/Update. Usado para filtrar o state do form
 * antes de enviar — o backend usa `extra="forbid"` e rejeita campos extras
 * como `id`, `active`, `createdAt`, etc.
 */
export const PATIENT_BASE_FIELDS: readonly (keyof PatientBaseFields)[] = [
  'prontuario', 'name', 'socialName', 'cpf', 'cns',
  'birthDate', 'sex', 'naturalidadeIbge', 'naturalidadeUf', 'paisNascimento',
  'identidadeGeneroId', 'orientacaoSexualId',
  'nacionalidadeId', 'racaId', 'etniaId', 'estadoCivilId', 'escolaridadeId',
  'religiaoId', 'povoTradicionalId', 'cboId', 'ocupacaoLivre',
  'situacaoRua', 'frequentaEscola', 'rendaFamiliar', 'beneficiarioBolsaFamilia',
  'cep', 'logradouroId', 'endereco', 'numero', 'complemento', 'bairro',
  'municipioIbge', 'uf', 'pais', 'areaMicroarea', 'latitude', 'longitude',
  'phone', 'cellphone', 'phoneRecado', 'email', 'idiomaPreferencial',
  'motherName', 'motherUnknown', 'fatherName', 'fatherUnknown',
  'responsavelNome', 'responsavelCpf', 'responsavelParentescoId',
  'contatoEmergenciaNome', 'contatoEmergenciaTelefone', 'contatoEmergenciaParentescoId',
  'tipoSanguineoId', 'alergias', 'temAlergia', 'doencasCronicas',
  'deficiencias', 'gestante', 'dum', 'fumante', 'etilista', 'observacoesClinicas',
  'planoTipo', 'convenioNome', 'convenioNumeroCarteirinha', 'convenioValidade',
  'unidadeSaudeId', 'vinculado', 'observacoes', 'consentimentoLgpd',
] as const

/**
 * Pega só os campos aceitos pelo schema Create/Update + anexa documents.
 * Remove propriedades extras herdadas do PatientRead (id, active, createdAt, ...).
 */
export function toSubmitPayload(
  form: PatientFormData,
  documents?: PatientDocumentInput[],
): PatientCreate & PatientUpdate {
  const out: Record<string, unknown> = {}
  for (const key of PATIENT_BASE_FIELDS) {
    out[key] = form[key]
  }
  if (documents !== undefined) out.documents = documents
  return out as PatientCreate & PatientUpdate
}

export type PatientCreate = Partial<PatientBaseFields> & {
  name: string
  cpf?: string | null
  prontuario?: string | null
  documents?: PatientDocumentInput[]
}

export type PatientUpdate = Partial<PatientBaseFields> & {
  reason?: string
  /** Se vier, reconcilia (add+update+remove pelos `id`s presentes). */
  documents?: PatientDocumentInput[]
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
  documents: PatientDocument[]
  // Presente apenas na resposta de POST /patients/{id}/photo. Indica se o
  // rosto foi identificado e cadastrado no reconhecimento facial.
  faceEnrollmentStatus?: 'ok' | 'no_face' | 'low_quality' | 'error' | 'disabled' | null
}

export interface PatientListItem {
  id: string
  prontuario: string
  name: string
  socialName: string
  cpf: string | null
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

export interface PatientPhotoMeta {
  id: string
  patientId: string
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  uploadedBy: string | null
  uploadedByName: string
  uploadedAt: string
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

export interface PatientLookupParams {
  cpf?: string
  cns?: string
  documento?: string
  name?: string
  birthDate?: string
  motherName?: string
  fatherName?: string
  limit?: number
}

export const hspApi = {
  list: (params: PatientListParams = {}) =>
    api.get<PageResponse<PatientListItem>>(
      `/api/v1/hsp/patients${qs({ ...params })}`,
      { withContext: true },
    ),

  /** Busca pré-cadastro: aceita combinação de CPF/CNS/documento/nome+nasc/filiação. */
  lookup: (params: PatientLookupParams) =>
    api.get<PatientListItem[]>(
      `/api/v1/hsp/patients/lookup${qs({
        cpf: params.cpf,
        cns: params.cns,
        documento: params.documento,
        name: params.name,
        birth_date: params.birthDate,
        mother_name: params.motherName,
        father_name: params.fatherName,
        limit: params.limit,
      })}`,
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

  /** Reativa um paciente previamente desativado. */
  restore: (id: string, reason?: string) =>
    apiFetch<PatientRead>(
      `/api/v1/hsp/patients/${id}/restore${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`,
      { method: 'POST', withContext: true },
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

  /** Lista todas as fotos já enviadas (mais recente primeiro). */
  listPhotos: (id: string) =>
    api.get<PatientPhotoMeta[]>(`/api/v1/hsp/patients/${id}/photos`, { withContext: true }),

  /** Define uma foto antiga como a atual. */
  restorePhoto: (id: string, photoId: string) =>
    apiFetch<PatientRead>(`/api/v1/hsp/patients/${id}/photos/${photoId}/restore`, {
      method: 'POST', withContext: true,
    }),

  // ── Histórico ─────────────────────────────────────
  listHistory: (id: string, params: { field?: string; page?: number; pageSize?: number } = {}) =>
    api.get<PageResponse<PatientFieldHistoryItem>>(
      `/api/v1/hsp/patients/${id}/history${qs({ ...params })}`,
      { withContext: true },
    ),
}
