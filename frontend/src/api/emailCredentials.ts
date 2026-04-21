// Endpoints admin de credenciais SES por escopo.

import { api } from './client'

export type CredentialsScope = 'system' | 'municipality' | 'facility'

export interface EmailCredentials {
  id: string
  scopeType: CredentialsScope
  scopeId: string
  fromEmail: string
  fromName: string
  awsRegion: string
  awsAccessKeyId: string
  awsSecretSet: boolean
  sesConfigurationSet: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface EmailCredentialsUpsert {
  scopeType: CredentialsScope
  scopeId?: string | null
  fromEmail: string
  fromName?: string
  awsRegion?: string
  awsAccessKeyId: string
  /** Se omitido no update, mantém o atual. Obrigatório na criação. */
  awsSecretAccessKey?: string | null
  sesConfigurationSet?: string | null
  isActive?: boolean
}

export interface TestResult {
  ok: boolean
  messageId: string | null
  error: string | null
  source: string
  fromEmail: string
}

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

export const emailCredentialsApi = {
  get: (scopeType: CredentialsScope, scopeId?: string | null) =>
    api.get<EmailCredentials | null>(
      `/api/v1/email-credentials${qs({ scope_type: scopeType, scope_id: scopeId })}`,
    ),

  upsert: (payload: EmailCredentialsUpsert) =>
    api.put<EmailCredentials>('/api/v1/email-credentials', payload),

  remove: (scopeType: CredentialsScope, scopeId?: string | null) =>
    api.delete<void>(
      `/api/v1/email-credentials${qs({ scope_type: scopeType, scope_id: scopeId })}`,
    ),

  test: (to: string, scopeType: CredentialsScope, scopeId?: string | null) =>
    api.post<TestResult>('/api/v1/email-credentials/test', { to, scopeType, scopeId }),
}
