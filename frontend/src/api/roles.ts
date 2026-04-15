// RBAC — perfis e permissões.
//
// Dois contextos:
//  - `adminApi` : operações MASTER (sem X-Work-Context), em /api/v1/admin/roles.
//  - `ctxApi`   : operações de ADMIN município (com X-Work-Context), em /api/v1/roles.
//
// O catálogo `/permissions` exige contexto (read-only para quem tem roles.role.view).

import { api } from './client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RoleScope = 'SYSTEM' | 'MUNICIPALITY'
export type RolePermissionState = 'grant' | 'deny' | 'inherit'

export interface PermissionDef {
  code: string
  module: string
  resource: string
  action: string
  description: string
}

export interface PermissionGroup {
  module: string
  permissions: PermissionDef[]
}

export interface RoleSummary {
  id: string
  code: string
  name: string
  description: string | null
  scope: RoleScope
  municipalityId: string | null
  parentId: string | null
  isSystemBase: boolean
  archived: boolean
  version: number
}

export interface RolePermissionEntry {
  code: string
  module: string
  resource: string
  action: string
  description: string
  state: RolePermissionState
  effective: boolean
  inheritedEffective: boolean | null
  overriddenParent: boolean
}

export interface RoleDetail extends RoleSummary {
  parent: RoleSummary | null
  permissions: RolePermissionEntry[]
}

export interface RoleCreatePayload {
  code: string
  name: string
  description?: string | null
  parentId?: string | null
}

export interface RoleUpdatePayload {
  name?: string
  description?: string | null
  parentId?: string | null
}

export interface RolePermissionsUpdatePayload {
  permissions: Array<{ code: string; state: RolePermissionState }>
}

// ─── Overrides por acesso ────────────────────────────────────────────────────

/**
 * Entry da matriz de permissões de um acesso específico.
 * - `state` = override (grant/deny/inherit).
 * - `effective` = resultado final (role chain + override).
 * - `roleEffective` = o que o perfil sozinho daria (sem override).
 * - `overridden` = estado explícito diverge do perfil.
 */
export interface AccessPermissionEntry {
  code: string
  module: string
  resource: string
  action: string
  description: string
  state: RolePermissionState
  effective: boolean
  roleEffective: boolean
  overridden: boolean
}

export interface AccessPermissionsDetail {
  userId: string
  userName: string
  facilityAccessId: string
  facilityId: string
  facilityName: string
  municipalityId: string
  role: RoleSummary | null
  permissions: AccessPermissionEntry[]
}

export interface AccessPermissionsUpdatePayload {
  permissions: Array<{ code: string; state: RolePermissionState }>
}

// ─── Contexto (ADMIN município) ──────────────────────────────────────────────

export const rolesApi = {
  listPermissions: () =>
    api.get<PermissionGroup[]>('/api/v1/permissions', { withContext: true }),

  list: (opts?: { includeArchived?: boolean }) => {
    const qs = opts?.includeArchived ? '?includeArchived=true' : ''
    return api.get<RoleSummary[]>(`/api/v1/roles${qs}`, { withContext: true })
  },

  get: (id: string) =>
    api.get<RoleDetail>(`/api/v1/roles/${id}`, { withContext: true }),

  create: (payload: RoleCreatePayload) =>
    api.post<RoleDetail>('/api/v1/roles', payload, { withContext: true }),

  update: (id: string, payload: RoleUpdatePayload) =>
    api.patch<RoleDetail>(`/api/v1/roles/${id}`, payload, { withContext: true }),

  archive: (id: string) =>
    api.post<RoleDetail>(`/api/v1/roles/${id}/archive`, undefined, { withContext: true }),

  unarchive: (id: string) =>
    api.post<RoleDetail>(`/api/v1/roles/${id}/unarchive`, undefined, { withContext: true }),

  setPermissions: (id: string, payload: RolePermissionsUpdatePayload) =>
    api.put<RoleDetail>(`/api/v1/roles/${id}/permissions`, payload, { withContext: true }),

  getAccessPermissions: (userId: string, accessId: string) =>
    api.get<AccessPermissionsDetail>(
      `/api/v1/users/${userId}/accesses/${accessId}/permissions`,
      { withContext: true },
    ),

  setAccessPermissions: (
    userId: string,
    accessId: string,
    payload: AccessPermissionsUpdatePayload,
  ) =>
    api.put<AccessPermissionsDetail>(
      `/api/v1/users/${userId}/accesses/${accessId}/permissions`,
      payload,
      { withContext: true },
    ),
}

// ─── MASTER (admin global, sem contexto) ─────────────────────────────────────

export const rolesAdminApi = {
  list: (opts?: { municipalityId?: string; scope?: RoleScope; includeArchived?: boolean }) => {
    const params = new URLSearchParams()
    if (opts?.municipalityId) params.set('municipalityId', opts.municipalityId)
    if (opts?.scope) params.set('scope', opts.scope)
    if (opts?.includeArchived !== undefined) params.set('includeArchived', String(opts.includeArchived))
    const qs = params.toString()
    return api.get<RoleSummary[]>(`/api/v1/admin/roles${qs ? `?${qs}` : ''}`)
  },

  get: (id: string) =>
    api.get<RoleDetail>(`/api/v1/admin/roles/${id}`),

  create: (payload: RoleCreatePayload, opts?: { municipalityId?: string }) => {
    const qs = opts?.municipalityId ? `?municipalityId=${opts.municipalityId}` : ''
    return api.post<RoleDetail>(`/api/v1/admin/roles${qs}`, payload)
  },

  update: (id: string, payload: RoleUpdatePayload) =>
    api.patch<RoleDetail>(`/api/v1/admin/roles/${id}`, payload),

  archive: (id: string) =>
    api.post<RoleDetail>(`/api/v1/admin/roles/${id}/archive`, undefined),

  unarchive: (id: string) =>
    api.post<RoleDetail>(`/api/v1/admin/roles/${id}/unarchive`, undefined),

  setPermissions: (id: string, payload: RolePermissionsUpdatePayload) =>
    api.put<RoleDetail>(`/api/v1/admin/roles/${id}/permissions`, payload),

  getAccessPermissions: (userId: string, accessId: string) =>
    api.get<AccessPermissionsDetail>(
      `/api/v1/admin/users/${userId}/accesses/${accessId}/permissions`,
    ),

  setAccessPermissions: (
    userId: string,
    accessId: string,
    payload: AccessPermissionsUpdatePayload,
  ) =>
    api.put<AccessPermissionsDetail>(
      `/api/v1/admin/users/${userId}/accesses/${accessId}/permissions`,
      payload,
    ),
}
