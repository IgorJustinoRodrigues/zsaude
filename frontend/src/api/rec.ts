// API "operacional" do módulo Recepção (chamadas, futuras filas, etc).

import { api } from './client'

export interface CallInput {
  ticket: string
  counter: string
  patientName?: string | null
  priority?: boolean
}

export const recApi = {
  /** Publica uma chamada no painel da unidade atual (via work context). */
  publishCall: (payload: CallInput) =>
    api.post<void>('/api/v1/rec/calls', payload),
}
