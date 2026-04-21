// Endpoints de sessão e presença.

import { api } from './client'

export interface SessionRead {
  id: string
  userId: string
  userName: string | null
  startedAt: string
  lastSeenAt: string
  endedAt: string | null
  endReason: string | null
  ip: string
  userAgent: string
  isActive: boolean
  isOnline: boolean
  durationSeconds: number
}

export interface PresenceItem {
  userId: string
  userName: string
  email: string
  primaryRole: string
  sessionId: string
  startedAt: string
  lastSeenAt: string
  ip: string
}

export const sessionsApi = {
  mySessions: (limit = 20) =>
    api.get<SessionRead[]>(`/api/v1/users/me/sessions?limit=${limit}`),

  userSessions: (userId: string, limit = 20) =>
    api.get<SessionRead[]>(`/api/v1/users/${userId}/sessions?limit=${limit}`),

  presence: (scope?: 'actor', municipalityId?: string | null) => {
    const p = new URLSearchParams()
    if (scope) p.set('scope', scope)
    if (municipalityId) p.set('municipalityId', municipalityId)
    const qs = p.toString()
    return api.get<PresenceItem[]>(`/api/v1/users/presence${qs ? `?${qs}` : ''}`)
  },

  revokeSession: (userId: string, sessionId: string) =>
    api.post<{ message: string }>(
      `/api/v1/users/${userId}/sessions/${sessionId}/revoke`,
    ),
}
