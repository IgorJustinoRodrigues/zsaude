// API de dispositivos (totem/painel).

import { api, apiFetch } from './client'

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
  painelId: string | null
  painelName: string | null
  totemId: string | null
  totemName: string | null
}

export interface DeviceListItem extends DeviceRead {
  pairedByUserName: string | null
}

export interface DevicePairInput {
  code: string
  facilityId: string
  name: string
  type: DeviceType
  /** Vínculo opcional. Se omitido, device fica "aguardando configuração". */
  painelId?: string | null
  totemId?: string | null
}

export interface DeviceUpdateInput {
  name?: string
  /** ``null`` explícito desvincula. */
  painelId?: string | null
  totemId?: string | null
}

// ─── Config runtime (consumido pelo próprio device) ───────────────────────

export interface DeviceConfigPainel {
  id: string
  name: string
  mode: 'senha' | 'nome' | 'ambos'
  announceAudio: boolean
  sectorNames: string[]
  voiceId: string | null
}

export interface DeviceConfigTotem {
  id: string
  name: string
  capture: { cpf: boolean; cns: boolean; face: boolean; manualName: boolean }
  priorityPrompt: boolean
  voiceId: string | null
}

export interface DeviceConfigOutput {
  deviceId: string
  type: DeviceType
  name: string | null
  facilityId: string | null
  painel: DeviceConfigPainel | null
  totem: DeviceConfigTotem | null
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

  update: (id: string, payload: DeviceUpdateInput) =>
    api.patch<DeviceRead>(`/api/v1/devices/${id}`, payload, { withContext: true }),

  revoke: (id: string) =>
    api.delete<void>(`/api/v1/devices/${id}`, { withContext: true }),

  /** Config consumida pelo próprio device em runtime.
   *  ``X-Device-Token`` via header — independente do auth de usuário. */
  getConfig: (deviceToken: string) =>
    apiFetch<DeviceConfigOutput>('/api/v1/public/devices/config', {
      headers: { 'X-Device-Token': deviceToken },
    }),
}
