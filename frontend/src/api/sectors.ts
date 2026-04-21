// Setores (catálogo por município/unidade).

import { api } from './client'

export type SectorScope = 'municipality' | 'facility'

export interface Sector {
  id: string
  scopeType: SectorScope
  scopeId: string
  name: string
  abbreviation: string
  displayOrder: number
  archived: boolean
}

export interface EffectiveSectorsOutput {
  sectors: Sector[]
  source: 'municipality' | 'facility'
  facilityUsesCustom: boolean
}

export interface SectorCreate {
  name: string
  abbreviation?: string
  displayOrder?: number
}

export interface SectorUpdate {
  name?: string
  abbreviation?: string
  displayOrder?: number
  archived?: boolean
}

export const sectorsAdminApi = {
  // Município
  listMunicipality: (id: string) =>
    api.get<Sector[]>(`/api/v1/admin/sectors/municipalities/${id}/sectors`),

  createMunicipality: (id: string, payload: SectorCreate) =>
    api.post<Sector>(`/api/v1/admin/sectors/municipalities/${id}/sectors`, payload),

  reorderMunicipality: (id: string, ids: string[]) =>
    api.post<Sector[]>(`/api/v1/admin/sectors/municipalities/${id}/sectors/reorder`, { ids }),

  // Unidade
  listFacility: (id: string) =>
    api.get<Sector[]>(`/api/v1/admin/sectors/facilities/${id}/sectors`),

  createFacility: (id: string, payload: SectorCreate) =>
    api.post<Sector>(`/api/v1/admin/sectors/facilities/${id}/sectors`, payload),

  reorderFacility: (id: string, ids: string[]) =>
    api.post<Sector[]>(`/api/v1/admin/sectors/facilities/${id}/sectors/reorder`, { ids }),

  customizeFacility: (id: string) =>
    api.post<EffectiveSectorsOutput>(`/api/v1/admin/sectors/facilities/${id}/customize`, {}),

  uncustomizeFacility: (id: string) =>
    api.post<EffectiveSectorsOutput>(`/api/v1/admin/sectors/facilities/${id}/uncustomize`, {}),

  // Individual
  update: (sectorId: string, payload: SectorUpdate) =>
    api.patch<Sector>(`/api/v1/admin/sectors/${sectorId}`, payload),

  remove: (sectorId: string) =>
    api.delete<void>(`/api/v1/admin/sectors/${sectorId}`),
}

export const sectorsApi = {
  /** Setores efetivos do work-context atual. */
  effective: () =>
    api.get<EffectiveSectorsOutput>('/api/v1/sectors/effective', { withContext: true }),
}
