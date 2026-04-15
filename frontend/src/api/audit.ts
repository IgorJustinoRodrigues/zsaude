// Endpoint de audit logs compartilhado.

import { api } from './client'
import type { PageResponse } from './users'

export interface AuditLogItem {
  id: string
  userId: string | null
  userName: string
  municipalityId: string | null
  facilityId: string | null
  role: string
  module: string
  action: string
  severity: string
  resource: string
  resourceId: string
  description: string
  details: Record<string, unknown>
  ip: string
  userAgent: string
  requestId: string
  at: string
}

export interface AuditListParams {
  search?: string
  module?: string
  action?: string
  severity?: string
  scope?: 'master'
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

export const auditApi = {
  list: (params: AuditListParams = {}) =>
    api.get<PageResponse<AuditLogItem>>(`/api/v1/audit${qs({
      search: params.search,
      module: params.module,
      action: params.action,
      severity: params.severity,
      scope: params.scope,
      page: params.page,
      pageSize: params.pageSize,
    })}`),
}
