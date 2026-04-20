// Endpoints admin de usuários.

import type { SystemId } from '../types'
import { api, apiFetch } from './client'

export type UserStatus = 'Ativo' | 'Inativo' | 'Bloqueado'
export type UserLevel = 'master' | 'admin' | 'user'

// ─── Responses ────────────────────────────────────────────────────────────────

export interface UserListItem {
  id: string
  login: string
  email: string | null
  name: string
  cpf: string | null
  cns: string | null
  phone: string
  status: UserStatus
  level: UserLevel
  primaryRole: string
  createdAt: string
  municipalityCount: number
  facilityCount: number
  modules: SystemId[]
}

export interface CnesBinding {
  id: string
  cboId: string
  cboDescription: string | null
  cnesProfessionalId: string
  cnesSnapshotCpf: string | null
  cnesSnapshotNome: string | null
  /** ``null`` = herda do acesso pai. */
  roleId: string | null
  /** Nome do role específico (apenas quando roleId != null). */
  role: string | null
}

export interface FacilityAccessDetail {
  facilityAccessId: string
  facilityId: string
  facilityName: string
  facilityShortName: string
  facilityType: string
  roleId: string
  role: string
  modules: SystemId[]
  /** Lista de vínculos CNES — vazia quando nenhum foi feito. */
  cnesBindings: CnesBinding[]
}

export interface MunicipalityAccessDetail {
  municipalityId: string
  municipalityName: string
  municipalityState: string
  facilities: FacilityAccessDetail[]
}

export interface UserDetail {
  id: string
  login: string
  email: string | null
  name: string
  cpf: string | null
  cns: string | null
  phone: string
  status: UserStatus
  level: UserLevel
  primaryRole: string
  isActive: boolean
  isSuperuser: boolean
  birthDate: string | null
  /** ISO ou null. null = e-mail não verificado. */
  emailVerifiedAt: string | null
  /** Novo endereço aguardando confirmação (troca em andamento). */
  pendingEmail: string | null
  createdAt: string
  updatedAt: string
  municipalities: MunicipalityAccessDetail[]
}

export interface EmailVerificationRequestResponse {
  message: string
  emailTarget: string
  expiresAt: string
}

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface CnesBindingInput {
  cboId: string
  cboDescription: string | null
  cnesProfessionalId: string
  cnesSnapshotCpf: string | null
  cnesSnapshotNome: string | null
  /** ``null`` = herda do acesso pai. */
  roleId?: string | null
}

export interface FacilityAccessInput {
  facilityId: string
  roleId: string
  /** Lista de vínculos CNES atribuídos a esse acesso — pode ser vazia. */
  cnesBindings?: CnesBindingInput[]
}

export interface MunicipalityAccessInput {
  municipalityId: string
  facilities: FacilityAccessInput[]
}

export interface UserCreateInput {
  /** Opcional quando ``cpf`` é informado (e vice-versa). Pelo menos um é obrigatório. */
  email?: string
  name: string
  /** Opcional quando ``email`` é informado (e vice-versa). Pelo menos um é obrigatório. */
  cpf?: string
  /** CNS (Cartão Nacional de Saúde) — opcional. Aceita máscara ou só dígitos. */
  cns?: string
  phone?: string
  primaryRole: string
  password: string
  status?: UserStatus
  level?: UserLevel
  municipalities?: MunicipalityAccessInput[]
}

export interface UserUpdateInput {
  email?: string
  name?: string
  /** CNS opcional. Envie ``null`` para limpar o campo. */
  cns?: string | null
  phone?: string
  primaryRole?: string
  status?: UserStatus
  level?: UserLevel
  municipalities?: MunicipalityAccessInput[]
}

export interface UserListParams {
  search?: string
  status?: UserStatus
  module?: SystemId
  municipalityId?: string
  page?: number
  pageSize?: number
}

export interface AdminResetResponse {
  message: string
  newPassword: string
}

// ─── API ──────────────────────────────────────────────────────────────────────

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    s.set(k, String(v))
  }
  const str = s.toString()
  return str ? `?${str}` : ''
}

export interface UserStats {
  total: number
  ativo: number
  inativo: number
  bloqueado: number
}

// ─── Foto de usuário ──────────────────────────────────────────────────────────

export type UserFaceEnrollment =
  | 'ok'
  | 'no_face'
  | 'low_quality'
  | 'error'
  | 'disabled'
  | 'opted_out'
  | 'duplicate'

export interface UserPhotoDuplicateMatch {
  userId: string
  userName: string
  similarity: number  // 0..1
}

export interface UserPhotoUploadResponse {
  photoId: string
  mimeType: string
  fileSize: number
  uploadedAt: string
  faceEnrollment: UserFaceEnrollment
  /** Preenchido quando ``faceEnrollment='duplicate'``. */
  duplicateOf: UserPhotoDuplicateMatch | null
}

export interface UserPhotoListItem {
  id: string
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  uploadedAt: string
  uploadedByName: string
}

export interface UserBirthdayItem {
  id: string
  name: string
  socialName: string
  level: UserLevel
  primaryRole: string
  birthDate: string  // YYYY-MM-DD
  day: number
  month: number
  isToday: boolean
  age: number
}

export const userApi = {
  stats: () => api.get<UserStats>('/api/v1/users/stats'),

  /**
   * Aniversariantes do mês (1-12). Omita ``month`` pro mês atual.
   * Opcional ``municipalityId`` filtra por município — usado em /ops
   * pra listar só quem está vinculado à cidade ativa.
   */
  birthdays: (month?: number, municipalityId?: string) =>
    api.get<UserBirthdayItem[]>(`/api/v1/users/birthdays${qs({ month, municipalityId })}`),

  list: (params: UserListParams = {}) =>
    api.get<PageResponse<UserListItem>>(
      `/api/v1/users${qs({
        search: params.search,
        status: params.status,
        module: params.module,
        municipalityId: params.municipalityId,
        page: params.page,
        pageSize: params.pageSize,
      })}`,
    ),

  get: (id: string) => api.get<UserDetail>(`/api/v1/users/${id}`),

  create: (payload: UserCreateInput) => api.post<UserDetail>('/api/v1/users', payload),

  update: (id: string, payload: UserUpdateInput) =>
    api.patch<UserDetail>(`/api/v1/users/${id}`, payload),

  resetPassword: (id: string, newPassword?: string) =>
    api.post<AdminResetResponse>(`/api/v1/users/${id}/reset-password`, {
      newPassword: newPassword ?? null,
    }),

  /** Dispara o link de verificação de e-mail para o usuário. */
  requestEmailVerification: (id: string) =>
    api.post<EmailVerificationRequestResponse>(
      `/api/v1/users/${id}/email/verify-request`,
    ),

  activate: (id: string) =>
    api.post<{ message: string }>(`/api/v1/users/${id}/activate`),

  deactivate: (id: string) =>
    api.post<{ message: string }>(`/api/v1/users/${id}/deactivate`),

  block: (id: string) =>
    api.post<{ message: string }>(`/api/v1/users/${id}/block`),

  // ── Foto ───────────────────────────────────────────────────────────────
  uploadPhoto: (id: string, file: File | Blob) => {
    const fd = new FormData()
    fd.append('file', file, (file as File).name ?? 'photo.jpg')
    return apiFetch<UserPhotoUploadResponse>(`/api/v1/users/${id}/photo`, {
      method: 'POST',
      body: fd,
    })
  },

  /** URL do proxy do backend — inclui Authorization automaticamente via apiFetchBlob. */
  photoUrl: (id: string, photoId?: string) =>
    photoId
      ? `/api/v1/users/${id}/photos/${photoId}`
      : `/api/v1/users/${id}/photo`,

  removePhoto: (id: string) =>
    apiFetch<void>(`/api/v1/users/${id}/photo`, { method: 'DELETE' }),

  listPhotos: (id: string) =>
    api.get<UserPhotoListItem[]>(`/api/v1/users/${id}/photos`),

  restorePhoto: (id: string, photoId: string) =>
    apiFetch<UserPhotoUploadResponse>(
      `/api/v1/users/${id}/photos/${photoId}/restore`,
      { method: 'POST' },
    ),

  deleteFaceEmbedding: (id: string) =>
    apiFetch<void>(`/api/v1/users/${id}/face-embedding`, { method: 'DELETE' }),
}
