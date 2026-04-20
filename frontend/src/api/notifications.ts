// Central de notificações — endpoints do backend.

import { api } from './client'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface NotificationItem {
  id: string
  type: NotificationType
  category: string
  title: string
  message: string
  data: Record<string, unknown> | null
  read: boolean
  dismissed: boolean
  createdAt: string
  readAt: string | null
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

  unreadCount: () =>
    api.get<{ count: number }>('/api/v1/notifications/unread-count'),

  markRead: (id: string) =>
    api.patch<{ message: string }>(`/api/v1/notifications/${id}/read`),

  markAllRead: () =>
    api.post<{ message: string }>('/api/v1/notifications/read-all'),

  dismiss: (id: string) =>
    api.delete<void>(`/api/v1/notifications/${id}`),
}
