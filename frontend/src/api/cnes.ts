// Importação CNES.

import { api, apiFetch } from './client'

export type CnesImportStatus = 'running' | 'success' | 'failed' | 'partial'

export interface CnesImportFileItem {
  filename: string
  rowsTotal: number
  rowsInserted: number
  rowsUpdated: number
  rowsSkipped: number
  warnings: string[]
  errorMessage: string
}

export interface CnesImportSummary {
  id: string
  competencia: string                     // AAAAMM
  uploadedByUserId: string | null
  uploadedByUserName: string
  zipFilename: string
  zipSizeBytes: number
  status: CnesImportStatus
  errorMessage: string
  totalRowsProcessed: number
  startedAt: string                       // ISO
  finishedAt: string | null
}

export interface CnesImportDetail extends CnesImportSummary {
  files: CnesImportFileItem[]
}

export const cnesApi = {
  list: (limit = 50) =>
    api.get<CnesImportSummary[]>(`/api/v1/cnes/imports?limit=${limit}`, { withContext: true }),

  get: (id: string) =>
    api.get<CnesImportDetail>(`/api/v1/cnes/imports/${id}`, { withContext: true }),

  /** Upload multipart. Retorna o detail (com files) ao final. */
  upload: async (file: File): Promise<CnesImportDetail> => {
    const fd = new FormData()
    fd.append('file', file, file.name)
    return apiFetch<CnesImportDetail>('/api/v1/cnes/import', {
      method: 'POST',
      body: fd,           // client detecta FormData e não seta Content-Type
      withContext: true,
    })
  },
}
