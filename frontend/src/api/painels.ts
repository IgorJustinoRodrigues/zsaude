// Painéis de chamada lógicos — entidades nomeadas por município ou unidade.

import { api } from './client'

export type PainelScope = 'municipality' | 'facility'
export type PainelMode = 'senha' | 'nome' | 'ambos'

export interface Painel {
  id: string
  scopeType: PainelScope
  scopeId: string
  name: string
  mode: PainelMode
  announceAudio: boolean
  sectorNames: string[]
  archived: boolean
}

export interface AvailablePainel extends Painel {
  /** ``true`` = herdado do município (quando consultado sob escopo facility). */
  inherited: boolean
}

export interface PainelCreate {
  name: string
  mode?: PainelMode
  announceAudio?: boolean
  sectorNames?: string[]
}

export interface PainelUpdate {
  name?: string
  mode?: PainelMode
  announceAudio?: boolean
  sectorNames?: string[]
  archived?: boolean
}

export const painelsAdminApi = {
  listMunicipality: (id: string) =>
    api.get<Painel[]>(`/api/v1/admin/painels/municipalities/${id}/painels`),

  createMunicipality: (id: string, payload: PainelCreate) =>
    api.post<Painel>(`/api/v1/admin/painels/municipalities/${id}/painels`, payload),

  listFacility: (id: string) =>
    api.get<Painel[]>(`/api/v1/admin/painels/facilities/${id}/painels`),

  createFacility: (id: string, payload: PainelCreate) =>
    api.post<Painel>(`/api/v1/admin/painels/facilities/${id}/painels`, payload),

  update: (painelId: string, payload: PainelUpdate) =>
    api.patch<Painel>(`/api/v1/admin/painels/${painelId}`, payload),

  remove: (painelId: string) =>
    api.delete<void>(`/api/v1/admin/painels/${painelId}`),
}

export const painelsApi = {
  /** Painéis disponíveis pra unidade atual (próprios + herdados). */
  available: () =>
    api.get<AvailablePainel[]>('/api/v1/painels/available', { withContext: true }),
}
