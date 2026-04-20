import { create } from 'zustand'
import { notificationsApi, type NotificationItem } from '../api/notifications'

interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number
  loading: boolean
  /** Hidrata a lista + count vindos do backend. Chama no mount e no polling. */
  refresh: () => Promise<void>
  /** Só o count (mais barato — usado pelo polling do sino). */
  refreshCount: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismiss: (id: string) => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  refresh: async () => {
    set({ loading: true })
    try {
      const [list, count] = await Promise.all([
        notificationsApi.list({ limit: 100 }),
        notificationsApi.unreadCount(),
      ])
      set({ notifications: list, unreadCount: count.count, loading: false })
    } catch {
      // silencioso — notificação nunca pode quebrar a UI
      set({ loading: false })
    }
  },

  refreshCount: async () => {
    try {
      const r = await notificationsApi.unreadCount()
      set({ unreadCount: r.count })
    } catch { /* silencioso */ }
  },

  markRead: async (id) => {
    // Optimistic update — evita flicker no sino.
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, read: true } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
    try {
      await notificationsApi.markRead(id)
    } catch {
      await get().refresh()
    }
  },

  markAllRead: async () => {
    const previousUnread = get().unreadCount
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    }))
    try {
      await notificationsApi.markAllRead()
    } catch {
      set({ unreadCount: previousUnread })
      await get().refresh()
    }
  },

  dismiss: async (id) => {
    set(state => {
      const was = state.notifications.find(n => n.id === id)
      return {
        notifications: state.notifications.filter(n => n.id !== id),
        unreadCount: was && !was.read
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      }
    })
    try {
      await notificationsApi.dismiss(id)
    } catch {
      await get().refresh()
    }
  },
}))
