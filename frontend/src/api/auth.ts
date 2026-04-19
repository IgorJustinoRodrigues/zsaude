// Endpoints de autenticação.

import { api } from './client'

export interface TokenPair {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
}

export type UserLevel = 'master' | 'admin' | 'user'

export interface MeResponse {
  id: string
  login: string
  email: string | null
  name: string
  socialName: string
  cpf: string | null
  phone: string
  status: string
  level: UserLevel
  primaryRole: string
  birthDate: string | null
  currentPhotoId: string | null
  faceOptIn: boolean
  /** Quando a senha atual vai expirar (null se política desligada). */
  passwordExpiresAt: string | null
  /** Dias restantes — negativo se já expirou. null se política desligada. */
  passwordExpiresInDays: number | null
  /** Já expirou e precisa trocar antes de qualquer ação. */
  passwordExpired: boolean
  /** Senha é provisória (gerada por admin em reset). Precisa trocar ao entrar. */
  mustChangePassword: boolean
  /** Null enquanto o e-mail não foi confirmado. */
  emailVerifiedAt: string | null
  /** Novo e-mail em troca, aguardando confirmação via link. */
  pendingEmail: string | null
  createdAt: string
}

export interface UpdateMeInput {
  name?: string
  socialName?: string
  phone?: string
  email?: string
  birthDate?: string | null
  faceOptIn?: boolean
}

export const authApi = {
  login: (login: string, password: string) =>
    api.post<TokenPair>('/api/v1/auth/login', { login, password }, { anonymous: true }),

  me: () => api.get<MeResponse>('/api/v1/auth/me'),

  /** Perfil completo via /users/me (mesmo id + campos adicionais que /auth/me). */
  readMe: () => api.get<MeResponse>('/api/v1/users/me'),

  /** Atualização do próprio perfil. Usado pela tela "Minha Conta". */
  updateMe: (payload: UpdateMeInput) =>
    api.patch<MeResponse>('/api/v1/users/me', payload),

  logout: (refreshToken: string) =>
    api.post<{ message: string }>('/api/v1/auth/logout', { refreshToken }, { anonymous: true }),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/api/v1/auth/forgot-password', { email }, { anonymous: true }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ message: string }>('/api/v1/auth/reset-password', { token, newPassword }, { anonymous: true }),

  /**
   * Troca a senha do usuário logado. ``currentPassword`` é obrigatória
   * quando o usuário já tem uma senha pessoal — opcional (pode ser ``null``)
   * quando ele está usando uma senha provisória vinda de reset admin,
   * nesse caso o backend pula a verificação.
   */
  changePassword: (currentPassword: string | null, newPassword: string) =>
    api.post<{ message: string }>('/api/v1/auth/change-password', { currentPassword, newPassword }),

  /** Dados pro modal de aniversário (isBirthday + stats do último ano). */
  anniversary: () => api.get<AnniversaryResponse>('/api/v1/users/me/anniversary'),

  /** Solicita (ou reenvia) o link de verificação do e-mail do próprio usuário. */
  requestEmailVerification: () =>
    api.post<{
      message: string
      emailTarget: string
      expiresAt: string
    }>('/api/v1/users/me/email/verify-request'),

  /** Confirma e-mail via token recebido no link. Público. */
  confirmEmail: (token: string) =>
    api.post<{ message: string }>(
      '/api/v1/auth/email/confirm', { token }, { anonymous: true },
    ),
}

export interface AnniversaryStats {
  totalActions: number
  daysActive: number
  logins: number
  patientsTouched: number
  mostUsedModule: string | null
  mostUsedModuleCount: number
}

export interface AnniversaryResponse {
  isBirthday: boolean
  firstName: string
  age: number | null
  stats: AnniversaryStats
}
