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
  /** ``null`` = herda todos do município; array = personalização. */
  enabledModules?: string[] | null
  archived?: boolean
}

export interface MunicipalityDto {
  id: string
  name: string
  state: string
  ibge: string
}

export interface ContextCnesBinding {
  id: string
  cboId: string
  cboDescription: string | null
  cnesProfessionalId: string
  cnesSnapshotCpf: string | null
  cnesSnapshotNome: string | null
  /** Role efetivo quando este binding estiver ativo. Herda do acesso pai
   *  se o binding não tem role_id próprio. */
  role: string
  /** Módulos efetivos correspondentes — reflete o role acima. */
  modules: SystemId[]
}

export interface FacilityWithAccess {
  facility: FacilityDto
  role: string
  modules: SystemId[]
  cnesBindings: ContextCnesBinding[]
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
  permissions: string[]
  expiresIn: number
  cboBinding: ContextCnesBinding | null
}

export interface WorkContextCurrent {
  municipality: MunicipalityDto
  facility: FacilityDto
  role: string
  modules: SystemId[]
  permissions: string[]
  cboBinding: ContextCnesBinding | null
}

export const workContextApi = {
  options: () => api.get<WorkContextOptions>('/api/v1/work-context/options'),

  select: (
    municipalityId: string,
    facilityId: string,
    opts?: { module?: SystemId; cboBindingId?: string | null },
  ) =>
    api.post<WorkContextIssued>('/api/v1/work-context/select', {
      municipalityId,
      facilityId,
      module: opts?.module,
      cboBindingId: opts?.cboBindingId ?? null,
    }),

  current: () => api.get<WorkContextCurrent>('/api/v1/work-context/current', { withContext: true }),
}

// ─── Directory: municípios e unidades (read-only) ─────────────────────────────

type Scope = 'all' | 'actor'

export const directoryApi = {
  listMunicipalities: (scope?: Scope) =>
    api.get<MunicipalityDto[]>(
      `/api/v1/municipalities${scope ? `?scope=${scope}` : ''}`,
    ),
  /**
   * Lista unidades para selects. Retorna só **ativas** por padrão — passe
   * ``includeArchived: true`` só em telas administrativas que mostram
   * também as arquivadas.
   */
  listFacilities: (
    municipalityId?: string,
    scope?: Scope,
    opts?: { includeArchived?: boolean },
  ) => {
    const params = new URLSearchParams()
    if (municipalityId) params.set('municipalityId', municipalityId)
    if (scope) params.set('scope', scope)
    if (opts?.includeArchived) params.set('includeArchived', 'true')
    const qs = params.toString()
    return api.get<FacilityDto[]>(`/api/v1/facilities${qs ? `?${qs}` : ''}`)
  },
}
