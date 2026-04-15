import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, WorkContext, SystemId } from '../types'
import { mockUsers, mockMunicipalities, mockFacilities } from '../mock/users'

interface AuthState {
  user: User | null
  context: WorkContext | null
  currentSystem: SystemId | null
  isAuthenticated: boolean

  login: (login: string, password: string) => boolean
  /** Returns true if auto-selected (only one municipality + facility) */
  autoSelectContext: () => boolean
  selectContext: (municipalityId: string, facilityId: string) => void
  selectSystem: (system: SystemId) => void
  logout: () => void
  clearContext: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      context: null,
      currentSystem: null,
      isAuthenticated: false,

      login: (login, _password) => {
        const found = mockUsers.find(u => u.login === login) ?? mockUsers[0]
        if (found) {
          set({ user: { ...found }, isAuthenticated: true, context: null, currentSystem: null })
          return true
        }
        return false
      },

      autoSelectContext: () => {
        const { user } = get()
        if (!user) return false

        const allMuns = user.municipalities
        if (allMuns.length !== 1) return false
        const munAccess = allMuns[0]
        if (munAccess.facilities.length !== 1) return false

        const munAccess0 = munAccess
        const facAccess = munAccess0.facilities[0]
        const municipality = mockMunicipalities.find(m => m.id === munAccess0.municipalityId)
        const facility = mockFacilities.find(f => f.id === facAccess.facilityId)
        if (!municipality || !facility) return false

        set({
          context: {
            municipality,
            facility,
            role: facAccess.role,
            modules: facAccess.modules,
          },
        })
        return true
      },

      selectContext: (municipalityId, facilityId) => {
        const { user } = get()
        if (!user) return

        const munAccess = user.municipalities.find(m => m.municipalityId === municipalityId)
        if (!munAccess) return
        const facAccess = munAccess.facilities.find(f => f.facilityId === facilityId)
        if (!facAccess) return

        const municipality = mockMunicipalities.find(m => m.id === municipalityId)
        const facility = mockFacilities.find(f => f.id === facilityId)
        if (!municipality || !facility) return

        set({
          context: {
            municipality,
            facility,
            role: facAccess.role,
            modules: facAccess.modules,
          },
          currentSystem: null,
        })
      },

      selectSystem: (system) => set({ currentSystem: system }),

      clearContext: () => set({ context: null, currentSystem: null }),

      logout: () => set({ user: null, context: null, currentSystem: null, isAuthenticated: false }),
    }),
    {
      name: 'zsaude-auth',
      version: 3,
      migrate: () => ({ user: null, context: null, currentSystem: null, isAuthenticated: false }),
    }
  )
)
