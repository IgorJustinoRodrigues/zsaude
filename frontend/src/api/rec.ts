// API "operacional" do módulo Recepção (chamadas, tickets, etc).

import { api, apiFetch } from './client'

// ─── Reconhecimento facial (device auth) ────────────────────────────────

export interface ActiveTicketInfo {
  ticketNumber: string
  status: string
  facilityShortName: string
  sameFacility: boolean
}

export interface FaceCandidate {
  patientId: string
  name: string
  socialName: string | null
  cpfMasked: string | null
  cnsMasked: string | null
  similarity: number
  hasPhoto: boolean
  activeTicket: ActiveTicketInfo | null
}

export interface FaceMatchOutput {
  faceDetected: boolean
  detectionScore: number | null
  candidates: FaceCandidate[]
}

export interface CallInput {
  ticket: string
  counter: string
  patientName?: string | null
  priority?: boolean
}

// ─── Totem (device auth via X-Device-Token) ──────────────────────────────

export type DocType = 'cpf' | 'cns' | 'manual'

export interface EmitTicketInput {
  docType: DocType
  docValue?: string | null
  patientName: string
  priority?: boolean
  /** Quando a identidade veio por match facial, manda o patientId e
   *  deixa o backend resolver CPF/CNS via cadastro. */
  patientId?: string | null
}

export interface HandoverInfo {
  attendanceId: string
  facilityName: string
  facilityShortName: string
  status: string
  startedAt: string
}

export interface EmitTicketOutput {
  id: string
  ticketNumber: string
  priority: boolean
  patientName: string
  patientId: string | null
  handover: HandoverInfo | null
}

// ─── Recepção (user auth via X-Work-Context) ─────────────────────────────

export interface AttendanceItem {
  id: string
  facilityId: string
  ticketNumber: string
  priority: boolean
  docType: DocType
  docValue: string | null
  patientName: string
  patientId: string | null
  status: string
  sectorName: string | null
  arrivedAt: string
  calledAt: string | null
  startedAt: string | null
  forwardedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  needsHandoverFromAttendanceId: string | null
  handover: HandoverInfo | null
}

export const recApi = {
  /** Publica uma chamada no painel da unidade atual (via work context). */
  publishCall: (payload: CallInput) =>
    api.post<void>('/api/v1/rec/calls', payload, { withContext: true }),

  // ── Totem (device auth) ───────────────────────────────────────────
  emitTicket: (deviceToken: string, payload: EmitTicketInput) =>
    apiFetch<EmitTicketOutput>('/api/v1/rec/tickets', {
      method: 'POST',
      body: payload,
      headers: { 'X-Device-Token': deviceToken },
      anonymous: true,
    }),

  faceMatch: (deviceToken: string, photo: Blob) => {
    const fd = new FormData()
    fd.append('file', photo, 'capture.jpg')
    return apiFetch<FaceMatchOutput>('/api/v1/rec/face-match', {
      method: 'POST',
      body: fd,
      headers: { 'X-Device-Token': deviceToken },
      anonymous: true,
    })
  },

  faceEnroll: (deviceToken: string, patientId: string, photo: Blob) => {
    const fd = new FormData()
    fd.append('file', photo, 'capture.jpg')
    fd.append('patient_id', patientId)
    return apiFetch<void>('/api/v1/rec/face-enroll', {
      method: 'POST',
      body: fd,
      headers: { 'X-Device-Token': deviceToken },
      anonymous: true,
    })
  },

  deviceFacilityInfo: (deviceToken: string) =>
    apiFetch<{
      facilityName: string
      facilityShortName: string
      municipalityName: string
      municipalityUf: string
      timezone: string
    }>('/api/v1/rec/device/facility-info', {
      headers: { 'X-Device-Token': deviceToken },
      anonymous: true,
    }),

  /** Baixa a foto atual do paciente como Blob (device auth). */
  patientPhoto: async (deviceToken: string, patientId: string): Promise<Blob> => {
    const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '')
    const res = await fetch(
      `${BASE_URL}/api/v1/rec/patients/${patientId}/photo`,
      { headers: { 'X-Device-Token': deviceToken } },
    )
    if (!res.ok) throw new Error(`Falha ao buscar foto: ${res.status}`)
    return res.blob()
  },

  // ── Console da recepção (user auth) ────────────────────────────────
  listTickets: () =>
    api.get<AttendanceItem[]>('/api/v1/rec/tickets', { withContext: true }),

  callTicket: (id: string) =>
    api.post<AttendanceItem>(`/api/v1/rec/tickets/${id}/call`, {}, { withContext: true }),

  startTicket: (id: string) =>
    api.post<AttendanceItem>(`/api/v1/rec/tickets/${id}/start`, {}, { withContext: true }),

  forwardTicket: (id: string, sectorName: string) =>
    api.post<AttendanceItem>(`/api/v1/rec/tickets/${id}/forward`, { sectorName }, { withContext: true }),

  cancelTicket: (id: string, reason = '') =>
    api.post<AttendanceItem>(`/api/v1/rec/tickets/${id}/cancel`, { reason }, { withContext: true }),

  assumeHandover: (id: string) =>
    api.post<AttendanceItem>(`/api/v1/rec/tickets/${id}/assume-handover`, {}, { withContext: true }),
}
