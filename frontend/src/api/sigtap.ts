// Importação SIGTAP (Tabela Unificada de Procedimentos SUS) — global, MASTER only.

import { api, apiFetch } from './client'

export type SigtapImportStatus = 'running' | 'success' | 'failed' | 'partial'

export interface SigtapImportFileItem {
  filename: string
  rowsTotal: number
  rowsInserted: number
  rowsUpdated: number
  rowsSkipped: number
  warnings: string[]
  errorMessage: string
}

export interface SigtapImportSummary {
  id: string
  competencia: string                     // AAAAMM
  uploadedByUserId: string | null
  uploadedByUserName: string
  zipFilename: string
  zipSizeBytes: number
  status: SigtapImportStatus
  errorMessage: string
  totalRowsProcessed: number
  startedAt: string                       // ISO
  finishedAt: string | null
}

export interface SigtapImportDetail extends SigtapImportSummary {
  files: SigtapImportFileItem[]
}

export const sigtapApi = {
  list: (limit = 50) =>
    api.get<SigtapImportSummary[]>(`/api/v1/sigtap/imports?limit=${limit}`),

  get: (id: string) =>
    api.get<SigtapImportDetail>(`/api/v1/sigtap/imports/${id}`),

  /** Upload multipart. Retorna o detail (com files) ao final. */
  upload: async (file: File): Promise<SigtapImportDetail> => {
    const fd = new FormData()
    fd.append('file', file, file.name)
    return apiFetch<SigtapImportDetail>('/api/v1/sigtap/import', {
      method: 'POST',
      body: fd,
    })
  },
}
