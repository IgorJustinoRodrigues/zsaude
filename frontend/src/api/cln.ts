// Client do módulo Clínico (CLN). Atua sobre tickets encaminhados pela
// recepção pro setor configurado (triagem e/ou atendimento).

import { api, apiFetch } from './client'

// ─── Tipos ───────────────────────────────────────────────────────────────

export type ClnStatus =
  | 'triagem_waiting' | 'sector_waiting'
  | 'cln_called' | 'cln_attending'
  | 'finished' | 'cancelled' | 'evasion'

export interface ClnQueueItem {
  id: string
  facilityId: string
  ticketNumber: string
  priority: boolean
  patientId: string | null
  patientName: string
  status: ClnStatus
  sectorName: string | null
  arrivedAt: string
  calledAt: string | null
  startedAt: string | null
}

export interface ClnConfig {
  enabled?: boolean | null
  triagemEnabled?: boolean | null
  triagemSectorName?: string | null
  atendimentoSectorName?: string | null
}

export interface ClnConfigRead {
  scopeType: 'municipality' | 'facility'
  scopeId: string
  config: ClnConfig | null
}

export interface ClnConfigUpdate {
  config: ClnConfig | null
}

export interface EffectiveClnConfig {
  enabled: boolean
  triagemEnabled: boolean
  triagemSectorName: string | null
  atendimentoSectorName: string | null
  sources: Record<string, 'default' | 'municipality' | 'facility'>
}

// ─── Cliente ─────────────────────────────────────────────────────────────

const BASE = '/api/v1/cln'

export const clnApi = {
  // ── Runtime ──────────────────────────────────────
  effectiveConfig: (params?: { facilityId?: string; municipalityId?: string }) => {
    const q = new URLSearchParams()
    if (params?.facilityId) q.set('facilityId', params.facilityId)
    if (params?.municipalityId) q.set('municipalityId', params.municipalityId)
    const qs = q.toString()
    return api.get<EffectiveClnConfig>(
      `${BASE}/config/effective${qs ? `?${qs}` : ''}`,
      { withContext: true },
    )
  },

  listTriagem: () =>
    api.get<ClnQueueItem[]>(`${BASE}/triagem`, { withContext: true }),

  listAtendimento: () =>
    api.get<ClnQueueItem[]>(`${BASE}/atendimento`, { withContext: true }),

  // ── Ações de ticket ──────────────────────────────
  call: (id: string) =>
    api.post<ClnQueueItem>(`${BASE}/tickets/${id}/call`, {}, { withContext: true }),

  start: (id: string) =>
    api.post<ClnQueueItem>(`${BASE}/tickets/${id}/start`, {}, { withContext: true }),

  /** Triagem libera ticket pra fila de atendimento (muda sector_name). */
  release: (id: string) =>
    api.post<ClnQueueItem>(`${BASE}/tickets/${id}/release`, {}, { withContext: true }),

  /** Encerra o atendimento no setor — status terminal ``finished``. */
  finish: (id: string) =>
    api.post<ClnQueueItem>(`${BASE}/tickets/${id}/finish`, {}, { withContext: true }),

  cancel: (id: string, reason: string) =>
    api.post<ClnQueueItem>(
      `${BASE}/tickets/${id}/cancel`,
      { reason },
      { withContext: true },
    ),

  // ── Admin (MASTER) ───────────────────────────────
  admin: {
    getMunicipalityConfig: (municipalityId: string) =>
      api.get<ClnConfigRead>(`/api/v1/admin/cln/config/municipalities/${municipalityId}`),

    updateMunicipalityConfig: (municipalityId: string, payload: ClnConfigUpdate) =>
      apiFetch<ClnConfigRead>(
        `/api/v1/admin/cln/config/municipalities/${municipalityId}`,
        { method: 'PATCH', body: payload },
      ),

    getFacilityConfig: (facilityId: string) =>
      api.get<ClnConfigRead>(`/api/v1/admin/cln/config/facilities/${facilityId}`),

    updateFacilityConfig: (facilityId: string, payload: ClnConfigUpdate) =>
      apiFetch<ClnConfigRead>(
        `/api/v1/admin/cln/config/facilities/${facilityId}`,
        { method: 'PATCH', body: payload },
      ),
  },
}
