// Totens lógicos — entidades nomeadas por município ou unidade.

import { api } from './client'

export type TotemScope = 'municipality' | 'facility'

export interface TotemCapture {
  cpf: boolean
  cns: boolean
  face: boolean
  manualName: boolean
}

export type ResetStrategy = 'daily' | 'weekly' | 'monthly' | 'never'

export interface TotemNumbering {
  ticketPrefixNormal: string
  ticketPrefixPriority: string
  resetStrategy: ResetStrategy
  numberPadding: number
}

export interface Totem {
  id: string
  scopeType: TotemScope
  scopeId: string
  name: string
  capture: TotemCapture
  priorityPrompt: boolean
  archived: boolean
  numbering: TotemNumbering
  /** NULL = senha vai pra Recepção (default). Preenchido = vai direto pro setor. */
  defaultSectorName: string | null
}

export interface AvailableTotem extends Totem {
  inherited: boolean
}

export interface TotemCreate {
  name: string
  capture?: TotemCapture
  priorityPrompt?: boolean
  numbering?: TotemNumbering
  defaultSectorName?: string | null
}

export interface TotemUpdate {
  name?: string
  capture?: TotemCapture
  priorityPrompt?: boolean
  archived?: boolean
  numbering?: TotemNumbering
  defaultSectorName?: string | null
}

export const totensAdminApi = {
  listMunicipality: (id: string) =>
    api.get<Totem[]>(`/api/v1/admin/totens/municipalities/${id}/totens`),

  createMunicipality: (id: string, payload: TotemCreate) =>
    api.post<Totem>(`/api/v1/admin/totens/municipalities/${id}/totens`, payload),

  listFacility: (id: string) =>
    api.get<Totem[]>(`/api/v1/admin/totens/facilities/${id}/totens`),

  createFacility: (id: string, payload: TotemCreate) =>
    api.post<Totem>(`/api/v1/admin/totens/facilities/${id}/totens`, payload),

  update: (totemId: string, payload: TotemUpdate) =>
    api.patch<Totem>(`/api/v1/admin/totens/${totemId}`, payload),

  remove: (totemId: string) =>
    api.delete<void>(`/api/v1/admin/totens/${totemId}`),
}

export const totensApi = {
  available: () =>
    api.get<AvailableTotem[]>('/api/v1/totens/available', { withContext: true }),
}
