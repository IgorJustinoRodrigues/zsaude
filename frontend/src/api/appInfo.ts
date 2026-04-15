// Informações públicas do app (sem auth).

import { api } from './client'

export interface AppInfo {
  appName: string
  defaultLanguage: string
}

export const appInfoApi = {
  get: () => api.get<AppInfo>('/public/app-info', { anonymous: true }),
}
