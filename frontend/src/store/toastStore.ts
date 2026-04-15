// Toasts globais — feedback curto de sucesso/erro/aviso.
import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2, 10)
    const toast: Toast = { id, duration: 4000, ...t }
    set(s => ({ toasts: [...s.toasts, toast] }))
    if ((toast.duration ?? 4000) > 0) {
      setTimeout(() => {
        set(s => ({ toasts: s.toasts.filter(x => x.id !== id) }))
      }, toast.duration)
    }
    return id
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

// Helpers convenientes
export const toast = {
  success: (title: string, message?: string) =>
    useToastStore.getState().push({ type: 'success', title, message }),
  error:   (title: string, message?: string) =>
    useToastStore.getState().push({ type: 'error', title, message, duration: 6000 }),
  warning: (title: string, message?: string) =>
    useToastStore.getState().push({ type: 'warning', title, message }),
  info:    (title: string, message?: string) =>
    useToastStore.getState().push({ type: 'info', title, message }),
}
