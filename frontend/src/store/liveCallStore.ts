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
  /** Timestamp do último pedido de silêncio. Painel renderiza overlay
   *  animado enquanto ``Date.now() - silenceAt < SILENCE_DURATION_MS``. */
  silenceAt: number | null
  push: (c: Omit<LiveCall, 'id'>) => void
  requestSilence: () => void
  clearSilence: () => void
  clear: () => void
}

const MAX_HISTORY = 4
export const SILENCE_DURATION_MS = 6_000

export const useLiveCallStore = create<State>()(set => ({
  current: null,
  history: [],
  silenceAt: null,
  push: raw => {
    const call: LiveCall = { ...raw, id: `${Date.now()}-${Math.random()}` }
    set(s => ({
      current: call,
      history: s.current ? [s.current, ...s.history].slice(0, MAX_HISTORY) : s.history,
    }))
  },
  requestSilence: () => set({ silenceAt: Date.now() }),
  clearSilence: () => set({ silenceAt: null }),
  clear: () => set({ current: null, history: [], silenceAt: null }),
}))
