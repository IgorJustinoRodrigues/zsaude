// Client do módulo Clínico (CLN). Atua sobre tickets encaminhados pela
// recepção pro setor configurado (triagem e/ou atendimento).

import { api, apiFetch } from './client'

// ─── Tipos ───────────────────────────────────────────────────────────────

export type ClnStatus =
  | 'triagem_waiting' | 'sector_waiting'
  | 'cln_called' | 'cln_attending'
  | 'finished' | 'cancelled' | 'evasion'
  | 'referred'

export interface ClnQueueItem {
  id: string
  facilityId: string
  ticketNumber: string
  priority: boolean
  patientId: string | null
  patientName: string
  status: ClnStatus
  sectorName: string | null
  arrivedAt: string
  calledAt: string | null
  startedAt: string | null
  startedByUserId: string | null
  startedByUserName: string | null
  priorityGroupId: string | null
  priorityGroupLabel: string | null
  /** Nº de triagens já feitas (0 = nunca, 1 = normal, ≥2 = retriagem). */
  triageCount: number
}

export interface ClnConfig {
  enabled?: boolean | null
  triagemEnabled?: boolean | null
  triagemSectorName?: string | null
  atendimentoSectorName?: string | null
}

export interface ClnConfigRead {
  scopeType: 'municipality' | 'facility'
  scopeId: string
  config: ClnConfig | null
}

export interface ClnConfigUpdate {
  config: ClnConfig | null
}

export interface EffectiveClnConfig {
  enabled: boolean
  triagemEnabled: boolean
  triagemSectorName: string | null
  atendimentoSectorName: string | null
  sources: Record<string, 'default' | 'municipality' | 'facility'>
}

export interface TriageInput {
  queixa?: string
  observacoes?: string
  paSistolica?: number | null
  paDiastolica?: number | null
  fc?: number | null
  fr?: number | null
  temperatura?: number | null
  spo2?: number | null
  glicemia?: number | null
  dor?: number
  // Antropometria (Fase D). ``imc`` é calculado no cliente e persistido.
  peso?: number | null
  altura?: number | null
  imc?: number | null
  perimetroCefalico?: number | null
  perimetroAbdominal?: number | null
  perimetroToracico?: number | null
  perimetroPanturrilha?: number | null
  // Gestação (Fase D). ``gestante=null`` = não perguntado.
  gestante?: boolean | null
  /** Data da Última Menstruação, ISO (YYYY-MM-DD). */
  dum?: string | null
  semanasGestacao?: number | null
  /** 1..5 (1 = Emergência, 5 = Não Urgente). */
  riskClassification: number
  riskAutoSuggested?: number | null
  riskOverrideReason?: string | null
  complaintCode?: string | null
  priorityGroupId?: string | null
}

export interface PriorityGroup {
  id: string
  name: string
  description: string
  displayOrder: number
  archived: boolean
}

export interface PriorityGroupCreate {
  name: string
  description?: string
  displayOrder?: number
}

export interface PriorityGroupUpdate {
  name?: string
  description?: string
  displayOrder?: number
  archived?: boolean
}

export type ProcedureSource = 'manual' | 'auto_triagem' | 'auto_atendimento'

export interface AttendanceProcedure {
  id: string
  attendanceId: string
  codigo: string
  nome: string
  competencia: string
  quantidade: number
  source: ProcedureSource
  complexidade: string | null
  markedByUserId: string | null
  markedByUserName: string
  markedAt: string
}

export interface Ubs {
  id: string
  name: string
  shortName: string
  cnes: string | null
}

export interface ReferralGuide {
  ticketId: string
  ticketNumber: string
  patientName: string
  patientDocType: string
  patientDocValue: string | null
  patientBirthDate: string | null
  patientSex: string | null
  riskClassification: number
  riskLabel: string
  complaintCode: string | null
  complaintName: string | null
  queixa: string
  observacoes: string
  originFacilityId: string
  originFacilityName: string
  ubsId: string
  ubsName: string
  ubsShortName: string
  ubsCnes: string | null
  referredAt: string
  referredByUserId: string | null
  referredByUserName: string
}

export interface CampinasDiscriminator {
  code: string
  text: string
  risk: number
}

export interface CampinasComplaint {
  code: string
  name: string
  description: string
  discriminators: CampinasDiscriminator[]
}

export interface ProcedureSearchResult {
  codigo: string
  nome: string
  complexidade: string | null
  competencia: string
}

export interface PendingAutoProcedure {
  codigo: string
  nome: string
  source: 'auto_triagem' | 'auto_atendimento'
  trigger: 'on_release' | 'on_finish'
}

export interface TriageRecordOut {
  id: string
  attendanceId: string
  queixa: string
  observacoes: string
  paSistolica: number | null
  paDiastolica: number | null
  fc: number | null
  fr: number | null
  temperatura: number | null
  spo2: number | null
  glicemia: number | null
  dor: number
  peso: number | null
  altura: number | null
  imc: number | null
  perimetroCefalico: number | null
  perimetroAbdominal: number | null
  perimetroToracico: number | null
  perimetroPanturrilha: number | null
  gestante: boolean | null
  dum: string | null
  semanasGestacao: number | null
  riskClassification: number
  riskAutoSuggested: number | null
  riskOverrideReason: string | null
  complaintCode: string | null
  triagedByUserId: string | null
  triagedByUserName: string
  createdAt: string
}

// ─── Cliente ─────────────────────────────────────────────────────────────

const BASE = '/api/v1/cln'

export const clnApi = {
  // ── Runtime ──────────────────────────────────────
  effectiveConfig: (params?: { facilityId?: string; municipalityId?: string }) => {
    const q = new URLSearchParams()
    if (params?.facilityId) q.set('facilityId', params.facilityId)
    if (params?.municipalityId) q.set('municipalityId', params.municipalityId)
    const qs = q.toString()
    // Só envia X-Work-Context quando NÃO há params explícitos — evita
    // forçar MASTER a ter work-context no fluxo admin.
    return api.get<EffectiveClnConfig>(
      `${BASE}/config/effective${qs ? `?${qs}` : ''}`,
      { withContext: !qs },
    )
  },

  getTicket: (id: string) =>
    api.get<ClnQueueItem>(`${BASE}/tickets/${id}`, { withContext: true }),

  listTriagem: () =>
    api.get<ClnQueueItem[]>(`${BASE}/triagem`, { withContext: true }),

  listAtendimento: () =>
    api.get<ClnQueueItem[]>(`${BASE}/atendimento`, { withContext: true }),

  // ── Ações de ticket ──────────────────────────────
  call: (id: string) =>
    api.post<ClnQueueItem>(`${BASE}/tickets/${id}/call`, {}, { withContext: true }),

  start: (id: string) =>
    api.post<ClnQueueItem>(`${BASE}/tickets/${id}/start`, {}, { withContext: true }),

  /** Triagem libera ticket pra fila de atendimento (muda sector_name).
   *  Sem persistir dados clínicos — use ``triageAndRelease`` quando
   *  houver form de triagem pra gravar. */
  release: (id: string) =>
    api.post<ClnQueueItem>(`${BASE}/tickets/${id}/release`, {}, { withContext: true }),

  /** Grava os dados da triagem + libera pra atendimento (atômico).
   *  ``riskClassification`` é 1..5 (1=emergência). */
  triageAndRelease: (id: string, payload: TriageInput) =>
    apiFetch<TriageRecordOut>(`${BASE}/tickets/${id}/triagem`, {
      method: 'POST', body: payload, withContext: true,
    }),

  /** Encerra o atendimento. Sem procedimentos marcados o backend retorna
   *  409 ``no_procedures_marked`` — o front deve perguntar ao usuário e
   *  reenviar com ``force=true`` se ele confirmar. */
  finish: (id: string, force = false) =>
    api.post<ClnQueueItem>(
      `${BASE}/tickets/${id}/finish${force ? '?force=true' : ''}`,
      {}, { withContext: true },
    ),

  cancel: (id: string, reason: string) =>
    api.post<ClnQueueItem>(
      `${BASE}/tickets/${id}/cancel`,
      { reason },
      { withContext: true },
    ),

  /** Marca o ticket como evadido (paciente não retornou). */
  evade: (id: string, reason = '') =>
    api.post<ClnQueueItem>(
      `${BASE}/tickets/${id}/evade`,
      { reason },
      { withContext: true },
    ),

  /** Devolve ticket pra fila de triagem (retriagem — Fase E). */
  retriage: (id: string) =>
    api.post<ClnQueueItem>(`${BASE}/tickets/${id}/retriagem`, {}, { withContext: true }),

  /** Histórico de triagens do ticket (mais recente primeiro). */
  listTriageHistory: (id: string) =>
    api.get<TriageRecordOut[]>(
      `${BASE}/tickets/${id}/triage-history`, { withContext: true },
    ),

  // ── Procedimentos SIGTAP (Fase F) ─────────────
  listProcedures: (id: string) =>
    api.get<AttendanceProcedure[]>(
      `${BASE}/tickets/${id}/procedures`, { withContext: true },
    ),

  addProcedure: (id: string, codigo: string, quantidade = 1) =>
    apiFetch<AttendanceProcedure | null>(
      `${BASE}/tickets/${id}/procedures`,
      {
        method: 'POST',
        body: { codigo, quantidade },
        withContext: true,
      },
    ),

  removeProcedure: (ticketId: string, procedureId: string) =>
    apiFetch<void>(
      `${BASE}/tickets/${ticketId}/procedures/${procedureId}`,
      { method: 'DELETE', withContext: true },
    ),

  /** Procedimentos que SERÃO auto-marcados no próximo checkpoint
   *  (liberar triagem ou finalizar atendimento) — "ghost" na UI. */
  listPendingProcedures: (id: string) =>
    api.get<PendingAutoProcedure[]>(
      `${BASE}/tickets/${id}/procedures-pending`, { withContext: true },
    ),

  /** Catálogo do protocolo Campinas — fluxogramas + discriminadores.
   *  Lista estática no backend (Fase G). */
  listCampinasComplaints: () =>
    api.get<CampinasComplaint[]>(`${BASE}/campinas/complaints`, { withContext: true }),

  // ── Encaminhamento pra UBS (Fase H) ──────────────
  listUbs: () =>
    api.get<Ubs[]>(`${BASE}/ubs`, { withContext: true }),

  refer: (id: string, ubsFacilityId: string) =>
    apiFetch<ClnQueueItem>(`${BASE}/tickets/${id}/refer`, {
      method: 'POST',
      body: { ubsFacilityId },
      withContext: true,
    }),

  getReferralGuide: (id: string) =>
    api.get<ReferralGuide>(
      `${BASE}/tickets/${id}/referral-guide`, { withContext: true },
    ),

  /** Busca procedimentos SIGTAP filtrados pelo CBO do profissional.
   *  Retorna [] se o contexto não tem CBO vinculado. */
  searchProcedures: (q: string, limit = 20) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('limit', String(limit))
    return api.get<ProcedureSearchResult[]>(
      `${BASE}/procedures/search?${params.toString()}`,
      { withContext: true },
    )
  },

  // ── Histórico por fila ───────────────────────────
  listTriagemEncaminhados: () =>
    api.get<ClnQueueItem[]>(`${BASE}/triagem/encaminhados`, { withContext: true }),

  listTriagemEvadidos: () =>
    api.get<ClnQueueItem[]>(`${BASE}/triagem/evadidos`, { withContext: true }),

  listAtendimentoEncaminhados: () =>
    api.get<ClnQueueItem[]>(`${BASE}/atendimento/encaminhados`, { withContext: true }),

  listAtendimentoEvadidos: () =>
    api.get<ClnQueueItem[]>(`${BASE}/atendimento/evadidos`, { withContext: true }),

  // ── Grupos prioritários (runtime) ────────────────
  listPriorityGroups: (includeArchived = false) =>
    api.get<PriorityGroup[]>(
      `${BASE}/priority-groups${includeArchived ? '?includeArchived=true' : ''}`,
      { withContext: true },
    ),

  setTicketPriorityGroup: (id: string, priorityGroupId: string | null) =>
    apiFetch<ClnQueueItem>(`${BASE}/tickets/${id}/priority-group`, {
      method: 'POST',
      body: { priorityGroupId },
      withContext: true,
    }),

  // ── Admin (MASTER) ───────────────────────────────
  admin: {
    getMunicipalityConfig: (municipalityId: string) =>
      api.get<ClnConfigRead>(`/api/v1/admin/cln/config/municipalities/${municipalityId}`),

    updateMunicipalityConfig: (municipalityId: string, payload: ClnConfigUpdate) =>
      apiFetch<ClnConfigRead>(
        `/api/v1/admin/cln/config/municipalities/${municipalityId}`,
        { method: 'PATCH', body: payload },
      ),

    getFacilityConfig: (facilityId: string) =>
      api.get<ClnConfigRead>(`/api/v1/admin/cln/config/facilities/${facilityId}`),

    updateFacilityConfig: (facilityId: string, payload: ClnConfigUpdate) =>
      apiFetch<ClnConfigRead>(
        `/api/v1/admin/cln/config/facilities/${facilityId}`,
        { method: 'PATCH', body: payload },
      ),

    listPriorityGroups: (municipalityId: string, includeArchived = true) =>
      api.get<PriorityGroup[]>(
        `/api/v1/admin/cln/priority-groups/municipalities/${municipalityId}${
          includeArchived ? '?includeArchived=true' : '?includeArchived=false'
        }`,
      ),

    createPriorityGroup: (municipalityId: string, payload: PriorityGroupCreate) =>
      apiFetch<PriorityGroup>(
        `/api/v1/admin/cln/priority-groups/municipalities/${municipalityId}`,
        { method: 'POST', body: payload },
      ),

    updatePriorityGroup: (
      municipalityId: string,
      groupId: string,
      payload: PriorityGroupUpdate,
    ) =>
      apiFetch<PriorityGroup>(
        `/api/v1/admin/cln/priority-groups/municipalities/${municipalityId}/${groupId}`,
        { method: 'PATCH', body: payload },
      ),

    deletePriorityGroup: (municipalityId: string, groupId: string) =>
      apiFetch<void>(
        `/api/v1/admin/cln/priority-groups/municipalities/${municipalityId}/${groupId}`,
        { method: 'DELETE' },
      ),
  },
}
