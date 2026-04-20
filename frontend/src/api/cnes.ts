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

// ─── Admin: busca live de profissionais CNES para vínculo CBO ────────────

export interface CnesImportStatusOut {
  imported: boolean
  lastImportAt: string | null
  lastCompetencia: string | null
  lastStatus: CnesImportStatus | null
}

export interface CnesProfessionalOption {
  cnesProfessionalId: string
  cpf: string
  nome: string
  cboId: string
  cboDescription: string
  unitCnes: string
  unitName: string
  status: string
}

export interface CnesImportMasterResult {
  id: string
  competencia: string
  status: CnesImportStatus
  totalRowsProcessed: number
  zipFilename: string
  startedAt: string
  finishedAt: string | null
}

export const cnesAdminApi = {
  /** Status do último import CNES do município (pra mostrar banner na UI). */
  importStatus: (municipalityId: string) =>
    api.get<CnesImportStatusOut>(
      `/api/v1/admin/cnes/import-status?municipalityId=${encodeURIComponent(municipalityId)}`,
    ),

  /** Busca live de profissionais da unidade por nome/CPF. */
  searchProfessionals: (params: { facilityId: string; q?: string; limit?: number }) => {
    const qs = new URLSearchParams({ facilityId: params.facilityId })
    if (params.q) qs.set('q', params.q)
    if (params.limit) qs.set('limit', String(params.limit))
    return api.get<CnesProfessionalOption[]>(`/api/v1/admin/cnes/professionals?${qs}`)
  },

  /** Upload CNES pelo painel MASTER (escolhe o município explicitamente). */
  uploadImport: async (municipalityId: string, file: File): Promise<CnesImportMasterResult> => {
    const fd = new FormData()
    fd.append('file', file, file.name)
    return apiFetch<CnesImportMasterResult>(
      `/api/v1/admin/cnes/import?municipalityId=${encodeURIComponent(municipalityId)}`,
      { method: 'POST', body: fd },
    )
  },

  /** Histórico de imports de um município específico. Reusa o endpoint
   *  user-facing via work-context não é possível aqui, então o painel
   *  MASTER lista só o resultado mais recente (via campo do município). */
}
