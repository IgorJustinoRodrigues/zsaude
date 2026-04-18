// Identidade visual (branding) por município e unidade.
//
// A config efetiva (``effective``) é o merge facility > municipality >
// padrão do sistema — use sempre ela pra renderizar PDFs, badges, etc.
// Para EDITAR a config, use ``getRaw`` / ``update`` (retorna apenas o
// registro do escopo, sem merge).

import { api, apiFetch } from './client'

export type BrandingScope = 'municipality' | 'facility'

export interface BrandingRaw {
  id: string
  scopeType: BrandingScope
  scopeId: string
  logoFileId: string | null
  displayName: string
  headerLine1: string
  headerLine2: string
  footerText: string
  /** Cor hex `#RRGGBB` ou string vazia. */
  primaryColor: string
  pdfConfigs: Record<string, Record<string, unknown>>
}

export interface BrandingEffective {
  displayName: string
  headerLine1: string
  headerLine2: string
  footerText: string
  primaryColor: string
  /** Path autenticado pro proxy de logo. ``null`` = sem logo. */
  logoUrl: string | null
  pdfConfigs: Record<string, Record<string, unknown>>
  sourceMunicipalityId: string | null
  sourceFacilityId: string | null
}

export interface BrandingUpdateInput {
  displayName?: string
  headerLine1?: string
  headerLine2?: string
  footerText?: string
  primaryColor?: string
  pdfConfigs?: Record<string, Record<string, unknown>>
}

export interface LogoUploadResponse {
  logoFileId: string
  logoUrl: string
}

export const brandingApi = {
  // ── Admin: município ─────────────────────────────────────────────
  getMunicipality: (id: string) =>
    api.get<BrandingRaw>(`/api/v1/admin/branding/municipalities/${id}`),

  updateMunicipality: (id: string, payload: BrandingUpdateInput) =>
    api.patch<BrandingRaw>(`/api/v1/admin/branding/municipalities/${id}`, payload),

  // ── Admin: unidade ──────────────────────────────────────────────
  getFacility: (id: string) =>
    api.get<BrandingRaw>(`/api/v1/admin/branding/facilities/${id}`),

  updateFacility: (id: string, payload: BrandingUpdateInput) =>
    api.patch<BrandingRaw>(`/api/v1/admin/branding/facilities/${id}`, payload),

  // ── Logo upload/remoção ─────────────────────────────────────────
  uploadLogo: (scope: BrandingScope, scopeId: string, file: File | Blob) => {
    const fd = new FormData()
    fd.append('file', file, (file as File).name ?? 'logo.png')
    return apiFetch<LogoUploadResponse>(
      `/api/v1/admin/branding/${scope}/${scopeId}/logo`,
      { method: 'POST', body: fd },
    )
  },

  deleteLogo: (scope: BrandingScope, scopeId: string) =>
    apiFetch<void>(
      `/api/v1/admin/branding/${scope}/${scopeId}/logo`,
      { method: 'DELETE' },
    ),

  // ── Consumo (qualquer autenticado) ──────────────────────────────
  effective: (opts: { municipalityId?: string; facilityId?: string } = {}) => {
    const qs = new URLSearchParams()
    if (opts.municipalityId) qs.set('municipalityId', opts.municipalityId)
    if (opts.facilityId) qs.set('facilityId', opts.facilityId)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return api.get<BrandingEffective>(`/api/v1/branding/effective${suffix}`)
  },

  /** Path absoluto de uma logo. ``null`` = sem logo. Uso direto em ``<img>``. */
  logoUrl: (fileId: string) => `/api/v1/branding/logo/${fileId}`,
}
