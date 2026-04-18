import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Estado de UI persistido (sidebar). O tema (dark/light) vive em
 * ``hooks/useTheme`` — fonte única de verdade, persistido em
 * ``zsaude:theme`` no localStorage.
 */
interface UIState {
  sidebarCollapsed: boolean
  sidebarMobileOpen: boolean
  toggleSidebar: () => void
  openMobileSidebar: () => void
  closeMobileSidebar: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      openMobileSidebar: () => set({ sidebarMobileOpen: true }),
      closeMobileSidebar: () => set({ sidebarMobileOpen: false }),
    }),
    { name: 'zsaude-ui' },
  )
)
