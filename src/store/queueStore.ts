import { create } from 'zustand'
import type { QueueEntry, QueueStatus } from '../types'
import { mockQueue } from '../mock/queue'

interface QueueState {
  entries: QueueEntry[]
  advanceRandom: () => void
  updateStatus: (id: string, status: QueueStatus) => void
}

export const useQueueStore = create<QueueState>((set) => ({
  entries: [...mockQueue],

  advanceRandom: () =>
    set(state => {
      const entries = [...state.entries]
      const waiting = entries.filter(e => e.status === 'Aguardando')
      const inTriage = entries.filter(e => e.status === 'Em Triagem')
      const inService = entries.filter(e => e.status === 'Em Atendimento')

      if (inService.length > 0 && Math.random() > 0.5) {
        const idx = entries.findIndex(e => e.id === inService[0].id)
        entries[idx] = { ...entries[idx], status: 'Atendido' }
      } else if (inTriage.length > 0) {
        const idx = entries.findIndex(e => e.id === inTriage[0].id)
        entries[idx] = { ...entries[idx], status: 'Em Atendimento' }
      } else if (waiting.length > 0) {
        const idx = entries.findIndex(e => e.id === waiting[0].id)
        entries[idx] = { ...entries[idx], status: 'Em Triagem' }
      }

      return { entries }
    }),

  updateStatus: (id, status) =>
    set(state => ({
      entries: state.entries.map(e => (e.id === id ? { ...e, status } : e)),
    })),
}))
