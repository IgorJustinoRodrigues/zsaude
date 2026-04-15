// Endpoint de audit logs compartilhado.

import { api } from './client'
import type { PageResponse } from './users'
import type { LogAction, LogSeverity, SystemLog } from '../mock/logs'

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

  /**
   * Busca até `maxItems` logs seguindo paginação do servidor.
   * Útil para relatórios que fazem análise client-side.
   */
  async listAll(params: AuditListParams = {}, maxItems = 1000): Promise<AuditLogItem[]> {
    const pageSize = Math.min(200, maxItems)
    let page = 1
    const out: AuditLogItem[] = []
    while (out.length < maxItems) {
      const res = await auditApi.list({ ...params, page, pageSize })
      out.push(...res.items)
      if (res.items.length < pageSize) break
      if (out.length >= res.total) break
      page += 1
    }
    return out.slice(0, maxItems)
  },
}

/** Converte um item da API para o shape `SystemLog` usado pelos relatórios. */
export function toSystemLog(item: AuditLogItem): SystemLog {
  // Ação pode vir com valor desconhecido — restringe aos literais esperados.
  const knownActions: LogAction[] = [
    'login', 'logout', 'login_failed',
    'view', 'create', 'edit', 'delete', 'export', 'print',
    'permission_change', 'password_reset', 'block_user',
  ]
  const action = (knownActions.includes(item.action as LogAction)
    ? item.action
    : 'view') as LogAction

  const knownSev: LogSeverity[] = ['info', 'warning', 'error', 'critical']
  const severity = (knownSev.includes(item.severity as LogSeverity)
    ? item.severity
    : 'info') as LogSeverity

  return {
    id: item.id,
    hash: item.requestId || item.id.slice(0, 16),
    userId: item.userId ?? '',
    userName: item.userName || '—',
    action,
    severity,
    module: item.module,
    resource: item.resource,
    resourceId: item.resourceId,
    description: item.description,
    details: typeof item.details === 'object'
      ? JSON.stringify(item.details, null, 2)
      : String(item.details ?? ''),
    ip: item.ip,
    userAgent: item.userAgent,
    at: new Date(item.at),
  }
}
