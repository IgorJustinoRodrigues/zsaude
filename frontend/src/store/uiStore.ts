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
      // Default: aberto (false = não colapsado). O usuário pode colapsar
      // via botão no header da Sidebar; a preferência é salva em
      // localStorage e restaurada no próximo load.
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      openMobileSidebar: () => set({ sidebarMobileOpen: true }),
      closeMobileSidebar: () => set({ sidebarMobileOpen: false }),
    }),
    {
      name: 'zsaude-ui',
      // Só o estado do sidebar desktop é lembrado; o menu mobile
      // sempre começa fechado em cada sessão (senão o backdrop pode
      // ficar "preso" após fechar a aba com menu aberto).
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  )
)
