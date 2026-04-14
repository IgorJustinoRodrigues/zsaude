import { create } from 'zustand'
import type { Notification } from '../types'
import { mockNotifications } from '../mock/notifications'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  markRead: (id: string) => void
  markAllRead: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [...mockNotifications],
  unreadCount: mockNotifications.filter(n => !n.read).length,

  markRead: (id) =>
    set(state => {
      const notifications = state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
      return { notifications, unreadCount: notifications.filter(n => !n.read).length }
    }),

  markAllRead: () =>
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    })),
}))
