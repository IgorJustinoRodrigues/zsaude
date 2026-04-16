// Tabelas de referência globais (MASTER only).

import { api, apiFetch } from './client'

export type RefKind =
  | 'nacionalidades'
  | 'racas'
  | 'etnias'
  | 'logradouros'
  | 'tipos-documento'
  | 'estados-civis'
  | 'escolaridades'
  | 'religioes'
  | 'tipos-sanguineos'
  | 'povos-tradicionais'
  | 'deficiencias'
  | 'parentescos'
  | 'orientacoes-sexuais'
  | 'identidades-genero'

export interface RefItem {
  id: string
  codigo: string
  descricao: string
  isSystem: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface RefListParams {
  search?: string
  active?: boolean
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    s.set(k, String(v))
  }
  const str = s.toString()
  return str ? `?${str}` : ''
}

export const referenceApi = {
  list: (kind: RefKind, params: RefListParams = {}) =>
    api.get<PageResponse<RefItem>>(`/api/v1/sys/reference/${kind}${qs({ ...params })}`),

  create: (kind: RefKind, payload: { codigo: string; descricao: string; active?: boolean }) =>
    apiFetch<RefItem>(`/api/v1/sys/reference/${kind}`, { method: 'POST', body: payload }),

  update: (kind: RefKind, id: string, payload: { descricao?: string; active?: boolean }) =>
    apiFetch<RefItem>(`/api/v1/sys/reference/${kind}/${id}`, { method: 'PATCH', body: payload }),

  remove: (kind: RefKind, id: string) =>
    apiFetch<void>(`/api/v1/sys/reference/${kind}/${id}`, { method: 'DELETE' }),
}
