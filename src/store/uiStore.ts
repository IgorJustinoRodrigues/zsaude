import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  sidebarMobileOpen: boolean
  darkMode: boolean
  toggleSidebar: () => void
  openMobileSidebar: () => void
  closeMobileSidebar: () => void
  toggleDarkMode: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      darkMode: false,
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      openMobileSidebar: () => set({ sidebarMobileOpen: true }),
      closeMobileSidebar: () => set({ sidebarMobileOpen: false }),
      toggleDarkMode: () => set(s => {
        const next = !s.darkMode
        document.documentElement.classList.toggle('dark', next)
        return { darkMode: next }
      }),
    }),
    {
      name: 'zsaude-ui',
      onRehydrateStorage: () => (state) => {
        if (state?.darkMode) document.documentElement.classList.add('dark')
      },
    }
  )
)
