// Endpoints admin de templates de e-mail.

import { api } from './client'

export type TemplateScope = 'system' | 'municipality' | 'facility'

export interface TemplateVariable {
  name: string
  description: string
  example: string
}

export interface TemplateCatalogEntry {
  code: string
  label: string
  description: string
  defaultSubject: string
  /** Source raw dos templates de arquivo — serve de ponto de partida no editor. */
  defaultBodyHtml: string | null
  defaultBodyText: string | null
  variables: TemplateVariable[]
}

export interface EmailTemplate {
  id: string
  code: string
  scopeType: TemplateScope
  scopeId: string
  subject: string
  bodyHtml: string | null
  bodyText: string | null
  fromName: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface EmailTemplateUpsert {
  scopeType: TemplateScope
  scopeId?: string | null
  subject: string
  bodyHtml?: string | null
  bodyText?: string | null
  fromName?: string | null
  isActive?: boolean
}

export interface PreviewRequest {
  subject?: string | null
  bodyHtml?: string | null
  bodyText?: string | null
  context?: Record<string, string | number> | null
  scopeType?: TemplateScope | null
  scopeId?: string | null
}

export interface PreviewResponse {
  subject: string
  bodyHtml: string | null
  bodyText: string | null
  fromName: string | null
  fromEmail: string | null
  /** 'system' | 'municipality' | 'facility' | 'env' — de onde vieram as creds. */
  credentialsSource: string | null
}

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return ''
  const search = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))
  return '?' + search.toString()
}

export const emailTemplatesApi = {
  catalog: () => api.get<TemplateCatalogEntry[]>('/api/v1/email-templates/catalog'),

  listByScope: (scopeType: TemplateScope, scopeId?: string | null) =>
    api.get<EmailTemplate[]>(`/api/v1/email-templates${qs({ scope_type: scopeType, scope_id: scopeId })}`),

  getOverride: (code: string, scopeType: TemplateScope, scopeId?: string | null) =>
    api.get<EmailTemplate | null>(`/api/v1/email-templates/${code}${qs({ scope_type: scopeType, scope_id: scopeId })}`),

  upsert: (code: string, payload: EmailTemplateUpsert) =>
    api.put<EmailTemplate>(`/api/v1/email-templates/${code}`, payload),

  remove: (code: string, scopeType: TemplateScope, scopeId?: string | null) =>
    api.delete<void>(`/api/v1/email-templates/${code}${qs({ scope_type: scopeType, scope_id: scopeId })}`),

  preview: (code: string, payload: PreviewRequest) =>
    api.post<PreviewResponse>(`/api/v1/email-templates/${code}/preview`, payload),
}
