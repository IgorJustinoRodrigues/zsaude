// Reconhecimento facial — client tipado.
//
// Diferente do gateway de IA (que fala com LLMs pagos), o face matching
// roda 100% local via InsightFace no próprio backend. Custo zero; a foto
// trafega só entre o browser autenticado e o backend.

import { api, apiFetch } from './client'

const PREFIX = '/api/v1'

// ─── Tipos ───────────────────────────────────────────────────────────────

export interface MatchDetection {
  score: number
  bbox: { x: number; y: number; w: number; h: number }
  faceCount: number
}

export interface MatchCandidate {
  patientId: string
  name: string
  socialName: string
  cpfMasked: string | null
  birthDate: string | null
  similarity: number      // 0..1 — quanto mais alto, mais parecido
  hasPhoto: boolean
}

export interface MatchFaceResponse {
  candidates: MatchCandidate[]
  detection: MatchDetection
}

export interface ReindexResponse {
  total: number
  enrolled: number
  noFace: number
  errors: number
}

// ─── API ─────────────────────────────────────────────────────────────────

export const faceApi = {
  /** Envia uma imagem e recebe até 5 pacientes com rostos parecidos. */
  match: (file: Blob | File): Promise<MatchFaceResponse> => {
    const fd = new FormData()
    // o backend espera o nome "file" no multipart
    fd.append('file', file, 'capture.jpg')
    return apiFetch<MatchFaceResponse>(`${PREFIX}/hsp/patients/match-face`, {
      method: 'POST',
      body: fd,
      withContext: true,
    })
  },

  /** Remove o embedding facial do paciente (opt-out). */
  deleteEmbedding: (patientId: string) =>
    api.delete<void>(`${PREFIX}/hsp/patients/${patientId}/face-embedding`, {
      withContext: true,
    }),

  /** Admin: regenera embeddings de todos pacientes com foto no município ativo. */
  reindex: (force = false) =>
    api.post<ReindexResponse>(
      `${PREFIX}/hsp/admin/face/reindex`,
      { force },
      { withContext: true },
    ),
}

// ─── Utilitários ─────────────────────────────────────────────────────────

/** Converte dataUrl em Blob (útil ao usar o scanner/MediaPipe). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',', 2)
  const mime = /data:(.*?);/.exec(head)?.[1] ?? 'image/jpeg'
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
