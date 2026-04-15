import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SystemId, WorkContext } from '../types'
import { authApi, type MeResponse } from '../api/auth'
import { workContextApi, type WorkContextOptions } from '../api/workContext'
import { setTokenStore } from '../api/client'

interface AuthState {
  // Identidade
  user: MeResponse | null

  // Tokens
  accessToken: string | null
  refreshToken: string | null
  contextToken: string | null

  // Contexto selecionado e sistema ativo
  context: WorkContext | null
  currentSystem: SystemId | null
  isAuthenticated: boolean

  // Árvore de opções (carregada após login)
  contextOptions: WorkContextOptions | null
  loadingOptions: boolean

  // Status de hidratação (tokens persistidos, user/options em memória)
  hydrated: boolean
  hydrating: boolean

  // Actions
  /** Recarrega user + contextOptions a partir dos tokens persistidos. */
  hydrate: () => Promise<void>
  login: (login: string, password: string) => Promise<boolean>
  fetchContextOptions: () => Promise<WorkContextOptions | null>
  /** Seleciona contexto via backend. Retorna os módulos disponíveis. */
  selectContext: (municipalityId: string, facilityId: string) => Promise<SystemId[]>
  selectSystem: (system: SystemId) => void
  logout: () => Promise<void>
  clearContext: () => void
  /** Auto-seleciona se há apenas 1 município + 1 unidade. Async (usa options). */
  autoSelectContext: () => Promise<SystemId[] | null>
  /** Checa se o user tem a permissão no contexto atual. MASTER (['*']) passa. */
  can: (code: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      contextToken: null,
      context: null,
      currentSystem: null,
      isAuthenticated: false,
      contextOptions: null,
      loadingOptions: false,
      hydrated: false,
      hydrating: false,

      hydrate: async () => {
        const { accessToken, user, hydrating, contextToken } = get()
        if (hydrating) return
        if (!accessToken) {
          set({ hydrated: true })
          return
        }
        if (user) {
          set({ hydrated: true })
          return
        }
        set({ hydrating: true })
        try {
          const [me, options] = await Promise.all([
            authApi.me(),
            workContextApi.options(),
          ])
          set({ user: me, contextOptions: options })

          // Se havia contexto persistido, revalida no backend. Se o token
          // expirou, limpa só o contexto e mantém o login ativo.
          if (contextToken) {
            try {
              const current = await workContextApi.current()
              set({
                context: {
                  municipality: {
                    id: current.municipality.id,
                    name: current.municipality.name,
                    state: current.municipality.state,
                    ibge: current.municipality.ibge,
                  },
                  facility: {
                    id: current.facility.id,
                    name: current.facility.name,
                    shortName: current.facility.shortName,
                    type: current.facility.type,
                    municipalityId: current.municipality.id,
                  },
                  role: current.role,
                  modules: current.modules,
                  permissions: current.permissions,
                },
              })
            } catch {
              // contexto expirado: limpa, mantém login
              set({ context: null, contextToken: null, currentSystem: null })
            }
          }

          set({ hydrated: true })
        } catch {
          // Tokens de auth inválidos: zera sessão inteira.
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            contextToken: null,
            context: null,
            currentSystem: null,
            isAuthenticated: false,
            contextOptions: null,
            hydrated: true,
          })
        } finally {
          set({ hydrating: false })
        }
      },

      login: async (login, password) => {
        const pair = await authApi.login(login, password)
        set({
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          isAuthenticated: true,
          context: null,
          contextToken: null,
          currentSystem: null,
          contextOptions: null,
          hydrated: true,
        })
        // Carrega perfil + options em paralelo
        const [me, options] = await Promise.all([
          authApi.me(),
          workContextApi.options(),
        ])
        set({ user: me, contextOptions: options })
        return true
      },

      fetchContextOptions: async () => {
        set({ loadingOptions: true })
        try {
          const options = await workContextApi.options()
          set({ contextOptions: options })
          return options
        } finally {
          set({ loadingOptions: false })
        }
      },

      selectContext: async (municipalityId, facilityId) => {
        const issued = await workContextApi.select(municipalityId, facilityId)
        set({
          contextToken: issued.contextToken,
          context: {
            municipality: {
              id: issued.municipality.id,
              name: issued.municipality.name,
              state: issued.municipality.state,
              ibge: issued.municipality.ibge,
            },
            facility: {
              id: issued.facility.id,
              name: issued.facility.name,
              shortName: issued.facility.shortName,
              type: issued.facility.type,
              municipalityId: issued.municipality.id,
            },
            role: issued.role,
            modules: issued.modules,
            permissions: issued.permissions,
          },
          currentSystem: null,
        })
        return issued.modules
      },

      can: (code) => {
        const perms = get().context?.permissions
        if (!perms) return false
        if (perms.includes('*')) return true
        return perms.includes(code)
      },

      autoSelectContext: async () => {
        let options = get().contextOptions
        if (!options) {
          options = await get().fetchContextOptions()
        }
        if (!options) return null
        if (options.municipalities.length !== 1) return null
        const mun = options.municipalities[0]
        if (mun.facilities.length !== 1) return null
        const fac = mun.facilities[0]
        const modules = await get().selectContext(mun.municipality.id, fac.facility.id)
        return modules
      },

      selectSystem: (system) => set({ currentSystem: system }),

      clearContext: () => set({ context: null, contextToken: null, currentSystem: null }),

      logout: async () => {
        const { refreshToken } = get()
        if (refreshToken) {
          try { await authApi.logout(refreshToken) } catch { /* ignora erros */ }
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          contextToken: null,
          context: null,
          currentSystem: null,
          isAuthenticated: false,
          contextOptions: null,
        })
      },
    }),
    {
      name: 'zsaude-auth',
      version: 4,
      // Migra estados antigos: zera tudo (usuário precisa logar de novo)
      migrate: () => ({
        user: null,
        accessToken: null,
        refreshToken: null,
        contextToken: null,
        context: null,
        currentSystem: null,
        isAuthenticated: false,
        contextOptions: null,
        loadingOptions: false,
        hydrated: false,
        hydrating: false,
      }),
      // Persiste tokens + flag de auth + contexto + módulo ativo, para que o
      // usuário caia direto na sua última unidade/módulo ao reabrir.
      // user e contextOptions são recarregados do backend na hidratação.
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        contextToken: state.contextToken,
        isAuthenticated: state.isAuthenticated,
        context: state.context,
        currentSystem: state.currentSystem,
      }),
    },
  ),
)

// ─── Injeta o token store no cliente HTTP ────────────────────────────────────

setTokenStore({
  getAccess: () => useAuthStore.getState().accessToken,
  getRefresh: () => useAuthStore.getState().refreshToken,
  getContext: () => useAuthStore.getState().contextToken,
  setTokens: (accessToken, refreshToken) => useAuthStore.setState({ accessToken, refreshToken }),
  clear: () =>
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      contextToken: null,
      context: null,
      currentSystem: null,
      isAuthenticated: false,
      contextOptions: null,
    }),
  onRefreshFailure: () => {
    // Redireciona para login; usa location para forçar reset completo
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
  },
})
