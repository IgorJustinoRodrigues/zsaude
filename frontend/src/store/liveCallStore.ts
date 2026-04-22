// Estado ao vivo das chamadas do painel. Preenchido pelos eventos
// ``painel:call`` recebidos via WebSocket no DevicePainelPage. O
// ``RecPainelPage`` (mesmo componente, seja em modo device ou preview
// autenticado) lê daqui.
//
// Fila de chamadas:
// - ``current`` é a chamada que está sendo anunciada agora.
// - ``pending`` são chamadas que chegaram enquanto ``current`` ainda
//   tocava — elas entram no FIM da fila.
// - ``advance()`` (chamado pelo announcer quando o áudio termina) move
//   ``current`` pra ``history`` e puxa a próxima de ``pending``.
// Isso garante que uma chamada nunca interrompe outra.

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
  pending: LiveCall[]
  history: LiveCall[]
  /** Timestamp do último pedido de silêncio. Painel renderiza overlay
   *  animado enquanto ``Date.now() - silenceAt < SILENCE_DURATION_MS``. */
  silenceAt: number | null
  push: (c: Omit<LiveCall, 'id'>) => void
  advance: () => void
  /** Descarta ``current`` + ``pending`` sem adicionar ao history —
   *  usado quando o silêncio interrompe tudo. */
  abortAll: () => void
  requestSilence: () => void
  clearSilence: () => void
  clear: () => void
}

const MAX_HISTORY = 4
export const SILENCE_DURATION_MS = 6_000

export const useLiveCallStore = create<State>()(set => ({
  current: null,
  pending: [],
  history: [],
  silenceAt: null,
  push: raw => {
    const call: LiveCall = { ...raw, id: `${Date.now()}-${Math.random()}` }
    set(s => {
      if (s.current) return { pending: [...s.pending, call] }
      return { current: call }
    })
  },
  advance: () => set(s => {
    if (!s.current) return s
    const history = [s.current, ...s.history].slice(0, MAX_HISTORY)
    const [next, ...rest] = s.pending
    return { current: next ?? null, pending: rest, history }
  }),
  abortAll: () => set({ current: null, pending: [] }),
  requestSilence: () => set({ silenceAt: Date.now() }),
  clearSilence: () => set({ silenceAt: null }),
  clear: () => set({ current: null, pending: [], history: [], silenceAt: null }),
}))
