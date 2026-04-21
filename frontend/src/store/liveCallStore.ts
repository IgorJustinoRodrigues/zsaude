// Estado ao vivo das chamadas do painel. Preenchido pelos eventos
// ``painel:call`` recebidos via WebSocket no DevicePainelPage. O
// ``RecPainelPage`` (mesmo componente, seja em modo device ou preview
// autenticado) lê daqui.

import { create } from 'zustand'

export interface LiveCall {
  id: string
  ticket: string
  counter: string
  patientName: string | null
  priority: boolean
  at: Date
}

interface State {
  current: LiveCall | null
  history: LiveCall[]
  push: (c: Omit<LiveCall, 'id'>) => void
  clear: () => void
}

const MAX_HISTORY = 4

export const useLiveCallStore = create<State>()(set => ({
  current: null,
  history: [],
  push: raw => {
    const call: LiveCall = { ...raw, id: `${Date.now()}-${Math.random()}` }
    set(s => ({
      current: call,
      history: s.current ? [s.current, ...s.history].slice(0, MAX_HISTORY) : s.history,
    }))
  },
  clear: () => set({ current: null, history: [] }),
}))
