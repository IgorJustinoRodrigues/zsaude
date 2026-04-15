// Configurações públicas do sistema exibidas na UI.
//
// Carregado uma vez no boot (main.tsx). O valor cai no Zustand e é
// consumido pelo <BrandName /> e qualquer outro lugar que precise do
// nome configurado em `app.system_settings`.

import { create } from 'zustand'
import { appInfoApi, type AppInfo } from '../api/appInfo'

const DEFAULT: AppInfo = { appName: 'zSaúde', defaultLanguage: 'pt-BR' }

interface AppInfoState {
  info: AppInfo
  loaded: boolean
  load: () => Promise<void>
}

export const useAppInfoStore = create<AppInfoState>((set) => ({
  info: DEFAULT,
  loaded: false,
  load: async () => {
    try {
      const info = await appInfoApi.get()
      set({ info, loaded: true })
      if (typeof document !== 'undefined') {
        document.title = info.appName
        document.documentElement.lang = info.defaultLanguage
      }
    } catch {
      set({ info: DEFAULT, loaded: true })
    }
  },
}))
