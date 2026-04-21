// Endpoints MASTER: municípios, unidades, configs, audit logs.

import { api } from './client'
import type { SystemId } from '../types'
import type { PageResponse } from './users'

// ─── Municípios ───────────────────────────────────────────────────────────────

export interface NeighborhoodInput {
  id?: string
  name: string
  population?: number | null
  latitude?: number | null
  longitude?: number | null
  territory?: [number, number][] | null
}

export interface NeighborhoodOut {
  id: string
  name: string
  population: number | null
  latitude: number | null
  longitude: number | null
  territory: [number, number][] | null
}

export interface MunicipalityAdminDetail {
  id: string
  name: string
  state: string
  ibge: string
  archived: boolean
  schemaName: string
  facilityCount: number
  userCount: number
  population: number | null
  centerLatitude: number | null
  centerLongitude: number | null
  territory: [number, number][] | null
  neighborhoods: NeighborhoodOut[]
  enabledModules: SystemId[]
  cadsusUser: string
  cadsusPasswordSet: boolean
  timezone: string
}

export interface MunicipalityCreateInput {
  name: string
  state: string
  ibge: string
  population?: number | null
  centerLatitude?: number | null
  centerLongitude?: number | null
  territory?: [number, number][] | null
  neighborhoods?: NeighborhoodInput[]
  enabledModules?: SystemId[]
  timezone?: string
}

export interface MunicipalityUpdateInput {
  name?: string
  state?: string
  population?: number | null
  centerLatitude?: number | null
  centerLongitude?: number | null
  territory?: [number, number][] | null
  neighborhoods?: NeighborhoodInput[]
  enabledModules?: SystemId[]
  cadsusUser?: string
  /** Passar `null` pra limpar, ou string nova pra trocar. Omitir = não mexe. */
  cadsusPassword?: string | null
  timezone?: string
}

// ─── Unidades ────────────────────────────────────────────────────────────────

export interface FacilityAdmin {
  id: string
  name: string
  shortName: string
  type: string
  cnes: string | null
  municipalityId: string
  /** ``null`` = herda os módulos do município; array = personalização. */
  enabledModules: SystemId[] | null
}

export interface FacilityCreateInput {
  municipalityId: string
  name: string
  shortName: string
  type: string
  cnes?: string | null
  enabledModules?: SystemId[] | null
}

export interface FacilityUpdateInput {
  name?: string
  shortName?: string
  type?: string
  cnes?: string | null
  /** Passar ``null`` explicitamente = voltar a herdar. Omitir = não mexe. */
  enabledModules?: SystemId[] | null
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface SystemSetting {
  id: string
  key: string
  value: unknown
  description: string
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditLogItem {
  id: string
  userId: string | null
  userName: string
  municipalityId: string | null
  facilityId: string | null
  role: string
  module: string
  action: string
  severity: string
  resource: string
  resourceId: string
  description: string
  details: Record<string, unknown>
  ip: string
  userAgent: string
  requestId: string
  at: string
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    s.set(k, String(v))
  }
  const str = s.toString()
  return str ? `?${str}` : ''
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const sysApi = {
  listMunicipalities: (includeArchived = false) =>
    api.get<MunicipalityAdminDetail[]>(
      `/api/v1/admin/municipalities${qs({ includeArchived })}`,
    ),
  getMunicipality: (id: string) =>
    api.get<MunicipalityAdminDetail>(`/api/v1/admin/municipalities/${id}`),
  createMunicipality: (payload: MunicipalityCreateInput) =>
    api.post<MunicipalityAdminDetail>('/api/v1/admin/municipalities', payload),
  updateMunicipality: (id: string, payload: MunicipalityUpdateInput) =>
    api.patch<MunicipalityAdminDetail>(`/api/v1/admin/municipalities/${id}`, payload),
  archiveMunicipality: (id: string) =>
    api.post<MunicipalityAdminDetail>(`/api/v1/admin/municipalities/${id}/archive`),
  unarchiveMunicipality: (id: string) =>
    api.post<MunicipalityAdminDetail>(`/api/v1/admin/municipalities/${id}/unarchive`),

  createFacility: (payload: FacilityCreateInput) =>
    api.post<FacilityAdmin>('/api/v1/admin/facilities', payload),
  updateFacility: (id: string, payload: FacilityUpdateInput) =>
    api.patch<FacilityAdmin>(`/api/v1/admin/facilities/${id}`, payload),
  archiveFacility: (id: string) =>
    api.post<{ message: string }>(`/api/v1/admin/facilities/${id}/archive`),
  unarchiveFacility: (id: string) =>
    api.post<{ message: string }>(`/api/v1/admin/facilities/${id}/unarchive`),

  listSettings: () => api.get<SystemSetting[]>('/api/v1/system/settings'),
  getSetting: (key: string) => api.get<SystemSetting>(`/api/v1/system/settings/${key}`),
  updateSetting: (key: string, value: unknown) =>
    api.patch<SystemSetting>(`/api/v1/system/settings/${key}`, { value }),

  listAudit: (params: {
    search?: string; module?: string; action?: string; severity?: string
    scope?: 'master'; page?: number; pageSize?: number
  } = {}) =>
    api.get<PageResponse<AuditLogItem>>(`/api/v1/audit${qs(params)}`),
}
