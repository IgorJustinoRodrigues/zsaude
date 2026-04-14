import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, SystemId } from '../types'
import { mockUsers } from '../mock/users'

interface AuthState {
  user: User | null
  currentSystem: SystemId | null
  isAuthenticated: boolean
  login: (login: string, password: string) => boolean
  selectSystem: (system: SystemId) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      currentSystem: null,
      isAuthenticated: false,

      login: (login, _password) => {
        const user = mockUsers.find(u => u.login === login) ?? mockUsers[0]
        if (user) {
          // Always use fresh user data from mock (ignores stale localStorage)
          set({ user: { ...user }, isAuthenticated: true, currentSystem: null })
          return true
        }
        return false
      },

      selectSystem: (system) => set({ currentSystem: system }),

      logout: () => set({ user: null, currentSystem: null, isAuthenticated: false }),
    }),
    { name: 'zsaude-auth' }
  )
)
