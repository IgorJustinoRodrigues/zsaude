// Endpoints de work context.

import type { SystemId } from '../types'
import { api } from './client'

export interface FacilityDto {
  id: string
  name: string
  shortName: string
  type: string
  cnes: string | null
  municipalityId: string
}

export interface MunicipalityDto {
  id: string
  name: string
  state: string
  ibge: string
}

export interface FacilityWithAccess {
  facility: FacilityDto
  role: string
  modules: SystemId[]
}

export interface MunicipalityWithFacilities {
  municipality: MunicipalityDto
  facilities: FacilityWithAccess[]
}

export interface WorkContextOptions {
  municipalities: MunicipalityWithFacilities[]
}

export interface WorkContextIssued {
  contextToken: string
  municipality: MunicipalityDto
  facility: FacilityDto
  role: string
  modules: SystemId[]
  expiresIn: number
}

export interface WorkContextCurrent {
  municipality: MunicipalityDto
  facility: FacilityDto
  role: string
  modules: SystemId[]
}

export const workContextApi = {
  options: () => api.get<WorkContextOptions>('/api/v1/work-context/options'),

  select: (municipalityId: string, facilityId: string, module?: SystemId) =>
    api.post<WorkContextIssued>('/api/v1/work-context/select', {
      municipalityId,
      facilityId,
      module,
    }),

  current: () => api.get<WorkContextCurrent>('/api/v1/work-context/current', { withContext: true }),
}

// ─── Directory: municípios e unidades (read-only) ─────────────────────────────

export const directoryApi = {
  listMunicipalities: () => api.get<MunicipalityDto[]>('/api/v1/municipalities'),
  listFacilities: (municipalityId?: string) =>
    api.get<FacilityDto[]>(
      `/api/v1/facilities${municipalityId ? `?municipalityId=${municipalityId}` : ''}`,
    ),
}
