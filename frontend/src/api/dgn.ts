// DGN — Diagnóstico. Stub inicial.

import { api } from './client'

export interface ExamItem {
  id: string
  patientName: string
  examName: string
  status: string
}

export const dgnApi = {
  listExams: () =>
    api.get<ExamItem[]>('/api/v1/dgn/exams', { withContext: true }),

  requestExam: () =>
    api.post<ExamItem>('/api/v1/dgn/exams', undefined, { withContext: true }),
}
