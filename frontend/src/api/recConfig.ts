// Config do módulo Recepção por município e unidade.
//
// A config efetiva (``effective``) é o merge unidade > município > defaults
// do sistema — use ela no runtime (Totem, Painel, Console). Pra EDITAR
// use ``getMunicipality`` / ``getFacility`` (sem merge).

import { api } from './client'

export type RecScope = 'municipality' | 'facility'

export interface TotemConfig {
  enabled: boolean
}

export interface PainelConfig {
  enabled: boolean
}

export type AfterAttendance = 'triagem' | 'consulta' | 'nenhum'

export interface RecepcaoConfig {
  enabled: boolean
  afterAttendance: AfterAttendance
}

export interface RecConfig {
  totem?: TotemConfig
  painel?: PainelConfig
  recepcao?: RecepcaoConfig
}

export interface RecConfigRead {
  scopeType: RecScope
  scopeId: string
  /** ``null`` = nada salvo neste escopo (herda integralmente). */
  config: RecConfig | null
}

export interface EffectiveRecConfig {
  totem: TotemConfig
  painel: PainelConfig
  recepcao: RecepcaoConfig
  /** Origem de cada bloco: ``default``, ``municipality`` ou ``facility``. */
  sources: Partial<Record<'totem' | 'painel' | 'recepcao', 'default' | 'municipality' | 'facility'>>
}

export interface RecConfigUpdateInput {
  /** ``null`` limpa (volta a herdar). Omitir não muda. */
  config: RecConfig | null
}

export type RecSection = 'totem' | 'painel' | 'recepcao'

export const recConfigApi = {
  getMunicipality: (id: string) =>
    api.get<RecConfigRead>(`/api/v1/admin/rec/config/municipalities/${id}`),

  updateMunicipality: (id: string, payload: RecConfigUpdateInput) =>
    api.patch<RecConfigRead>(`/api/v1/admin/rec/config/municipalities/${id}`, payload),

  clearMunicipalitySection: (id: string, section: RecSection) =>
    api.delete<RecConfigRead>(`/api/v1/admin/rec/config/municipalities/${id}/${section}`),

  getFacility: (id: string) =>
    api.get<RecConfigRead>(`/api/v1/admin/rec/config/facilities/${id}`),

  updateFacility: (id: string, payload: RecConfigUpdateInput) =>
    api.patch<RecConfigRead>(`/api/v1/admin/rec/config/facilities/${id}`, payload),

  clearFacilitySection: (id: string, section: RecSection) =>
    api.delete<RecConfigRead>(`/api/v1/admin/rec/config/facilities/${id}/${section}`),

  effective: (opts: { municipalityId?: string; facilityId?: string } = {}) => {
    const qs = new URLSearchParams()
    if (opts.municipalityId) qs.set('municipalityId', opts.municipalityId)
    if (opts.facilityId) qs.set('facilityId', opts.facilityId)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return api.get<EffectiveRecConfig>(`/api/v1/rec/config/effective${suffix}`)
  },
}
