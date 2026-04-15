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
  email: string
  name: string
  cpf: string
  phone: string
  status: string
  level: UserLevel
  primaryRole: string
  birthDate: string | null
  createdAt: string
}

export const authApi = {
  login: (login: string, password: string) =>
    api.post<TokenPair>('/api/v1/auth/login', { login, password }, { anonymous: true }),

  me: () => api.get<MeResponse>('/api/v1/auth/me'),

  logout: (refreshToken: string) =>
    api.post<{ message: string }>('/api/v1/auth/logout', { refreshToken }, { anonymous: true }),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/api/v1/auth/forgot-password', { email }, { anonymous: true }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ message: string }>('/api/v1/auth/reset-password', { token, newPassword }, { anonymous: true }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>('/api/v1/auth/change-password', { currentPassword, newPassword }),
}
