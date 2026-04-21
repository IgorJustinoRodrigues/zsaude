// API de dispositivos (totem/painel).

import { api } from './client'

export type DeviceType = 'totem' | 'painel'
export type DeviceStatus = 'pending' | 'paired' | 'revoked' | 'stale'

// ─── Pareamento (público) ────────────────────────────────────────────────────

export interface DeviceRegisterOutput {
  deviceId: string
  pairingCode: string
  pairingExpiresAt: string
}

export interface DeviceStatusOutput {
  status: DeviceStatus
  /** Devolvido uma única vez, no momento em que o status vira ``paired``. */
  deviceToken: string | null
  name: string | null
  facilityId: string | null
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface DeviceRead {
  id: string
  type: DeviceType
  facilityId: string | null
  name: string | null
  status: DeviceStatus
  pairedAt: string | null
  pairedByUserId: string | null
  lastSeenAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface DeviceListItem extends DeviceRead {
  pairedByUserName: string | null
}

export interface DevicePairInput {
  code: string
  facilityId: string
  name: string
  type: DeviceType
}

export const devicesApi = {
  // Public — sem auth
  register: (type: DeviceType) =>
    api.post<DeviceRegisterOutput>('/api/v1/public/devices/register', { type }),

  pollStatus: (deviceId: string) =>
    api.get<DeviceStatusOutput>(`/api/v1/public/devices/status/${deviceId}`),

  // Autenticado — precisa do X-Work-Context (endpoints usam CurrentContextDep)
  pair: (payload: DevicePairInput) =>
    api.post<DeviceRead>('/api/v1/devices/pair', payload, { withContext: true }),

  list: () =>
    api.get<DeviceListItem[]>('/api/v1/devices', { withContext: true }),

  revoke: (id: string) =>
    api.delete<void>(`/api/v1/devices/${id}`, { withContext: true }),
}
