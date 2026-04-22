// Módulo TTS — runtime (device auth) + admin (MASTER).
//
// Frontend orquestra o fluxo: compõe as frases conforme modo do painel,
// chama ``/prepare`` pra ter URLs, joga num `AudioQueue` que toca em
// sequência garantindo que nenhuma chamada é cortada.

import { api, apiFetch } from './client'

export type TtsProvider = 'elevenlabs' | 'google'

export interface TtsVoice {
  id: string
  provider: TtsProvider
  externalId: string
  name: string
  language: string
  gender: string | null
  description: string | null
  sampleUrl: string | null
  availableForSelection: boolean
  archived: boolean
  displayOrder: number
}

export interface PrepareAudio {
  text: string
  url: string
  durationMs: number | null
  fromCache: boolean
}

export interface PrepareOutput {
  voiceExternalId: string
  provider: TtsProvider
  audios: PrepareAudio[]
}

export interface PrepareInput {
  voiceId?: string | null
  phrases: string[]
}

export interface ProviderKeyRead {
  id: string
  provider: TtsProvider
  scopeType: 'global' | 'municipality'
  scopeId: string | null
  active: boolean
  apiKeyPreview: string
  extraConfig: Record<string, unknown> | null
}

export interface ActiveProviderInfo {
  provider: TtsProvider | null
  hasKey: boolean
}

// ─── Runtime (device auth) ─────────────────────────────────────────────────

export const ttsRuntimeApi = {
  /** Painel/totem manda frases e recebe URLs sequenciais. */
  prepare: (deviceToken: string, payload: PrepareInput) =>
    apiFetch<PrepareOutput>('/api/v1/rec/tts/prepare', {
      method: 'POST',
      body: payload,
      headers: { 'X-Device-Token': deviceToken },
      anonymous: true,
    }),

  /** Vozes que o admin liberou pra seleção (user auth). */
  listVoices: () =>
    api.get<TtsVoice[]>('/api/v1/rec/tts/voices', { withContext: true }),
}

// ─── Admin MASTER ──────────────────────────────────────────────────────────

export const ttsAdminApi = {
  getActiveProvider: () =>
    api.get<ActiveProviderInfo>('/api/v1/admin/tts/providers/active'),

  getKey: (provider: TtsProvider) =>
    api.get<ProviderKeyRead | null>(`/api/v1/admin/tts/providers/${provider}/key`),

  upsertKey: (provider: TtsProvider, apiKey: string) =>
    api.post<ProviderKeyRead>(`/api/v1/admin/tts/providers/${provider}/key`, { apiKey }),

  deleteKey: (provider: TtsProvider) =>
    api.delete<void>(`/api/v1/admin/tts/providers/${provider}/key`),

  testKey: (provider: TtsProvider, apiKey: string) =>
    api.post<{ ok: boolean }>(`/api/v1/admin/tts/providers/${provider}/test`, { apiKey }),

  listVoices: () =>
    api.get<TtsVoice[]>('/api/v1/admin/tts/voices'),

  updateVoice: (voiceId: string, patch: Partial<{
    name: string
    description: string | null
    gender: string | null
    sampleUrl: string | null
    availableForSelection: boolean
    archived: boolean
    displayOrder: number
  }>) =>
    api.patch<TtsVoice>(`/api/v1/admin/tts/voices/${voiceId}`, patch),

  setDefaultVoice: (voiceId: string) =>
    api.post<TtsVoice>(`/api/v1/admin/tts/voices/${voiceId}/set-default`, {}),

  previewVoice: (voiceId: string) =>
    api.post<PrepareOutput>(`/api/v1/admin/tts/voices/${voiceId}/preview`, {}),
}
