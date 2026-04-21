// Central de notificações — endpoints do backend.

import { api } from './client'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface NotificationItem {
  id: string
  type: NotificationType
  category: string
  title: string
  message: string
  hasBody: boolean
  hasAction: boolean
  data: Record<string, unknown> | null
  read: boolean
  dismissed: boolean
  createdAt: string
  readAt: string | null
}

export interface NotificationDetailItem extends NotificationItem {
  body: string | null
  actionUrl: string | null
  actionLabel: string | null
  createdByName: string | null
  scopeLabel: string | null
}

export type BroadcastScope = 'all' | 'municipality' | 'facility' | 'user'

export interface BroadcastCreateInput {
  scopeType: BroadcastScope
  scopeId?: string | null
  type: NotificationType
  category?: string
  title: string
  message: string
  body?: string | null
  actionUrl?: string | null
  actionLabel?: string | null
}

export interface BroadcastRead {
  id: string
  scopeType: BroadcastScope
  scopeId: string | null
  scopeLabel: string
  type: NotificationType
  category: string
  title: string
  message: string
  totalRecipients: number
  readCount: number
  createdAt: string
  createdByName: string | null
}

export interface BroadcastRecipient {
  userId: string
  userName: string
  readAt: string | null
}

export interface BroadcastDetail extends BroadcastRead {
  body: string | null
  actionUrl: string | null
  actionLabel: string | null
  recipients: BroadcastRecipient[]
}

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

export const notificationsApi = {
  list: (opts: { onlyUnread?: boolean; category?: string; limit?: number } = {}) =>
    api.get<NotificationItem[]>(
      `/api/v1/notifications${qs({
        onlyUnread: opts.onlyUnread,
        category: opts.category,
        limit: opts.limit,
      })}`,
    ),

  detail: (id: string) =>
    api.get<NotificationDetailItem>(`/api/v1/notifications/${id}`),

  unreadCount: () =>
    api.get<{ count: number }>('/api/v1/notifications/unread-count'),

  markRead: (id: string) =>
    api.patch<{ message: string }>(`/api/v1/notifications/${id}/read`),

  markAllRead: () =>
    api.post<{ message: string }>('/api/v1/notifications/read-all'),

  dismiss: (id: string) =>
    api.delete<void>(`/api/v1/notifications/${id}`),
}

export const notificationsAdminApi = {
  createBroadcast: (payload: BroadcastCreateInput) =>
    api.post<BroadcastRead>('/api/v1/admin/notifications/broadcast', payload),

  listBroadcasts: (limit = 50) =>
    api.get<BroadcastRead[]>(`/api/v1/admin/notifications/broadcasts?limit=${limit}`),

  broadcastDetail: (id: string) =>
    api.get<BroadcastDetail>(`/api/v1/admin/notifications/broadcasts/${id}`),
}
