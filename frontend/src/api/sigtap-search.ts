// Consultas SIGTAP — pesquisas de CBOs, CIDs, Procedimentos, Serviços, Habilitações e cruzamentos.

import { api } from './client'

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
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

// ── Types ──

export interface CboItem {
  codigo: string
  descricao: string
  totalProcedimentos: number
}

export interface CidItem {
  codigo: string
  descricao: string
  agravo: string
  sexo: string
  totalProcedimentos: number
}

export interface ProcedimentoItem {
  codigo: string
  nome: string
  complexidade: string
  sexo: string
  qtMaxima: number
  qtDias: number
  qtPontos: number
  idadeMinima: number
  idadeMaxima: number
  valorSh: number
  valorSa: number
  valorSp: number
  idFinanciamento: string
  competencia: string
  revogado: boolean
}

export interface CboProcedimentoItem {
  codigoProcedimento: string
  nomeProcedimento: string
  complexidade: string
  valorSh: number
  valorSa: number
  valorSp: number
  competencia: string
}

export interface CidProcedimentoItem {
  codigoProcedimento: string
  nomeProcedimento: string
  complexidade: string
  principal: string
  valorSh: number
  valorSa: number
  valorSp: number
  competencia: string
}

export interface ServicoItem {
  codigo: string
  descricao: string
  competencia: string
  totalClassificacoes: number
}

export interface ServicoProcedimentoItem {
  codigoProcedimento: string
  nomeProcedimento: string
  complexidade: string
  codigoClassificacao: string
  valorSh: number
  valorSa: number
  valorSp: number
  competencia: string
}

export interface HabilitacaoItem {
  codigo: string
  descricao: string
  competencia: string
  totalProcedimentos: number
}

export interface HabilitacaoProcedimentoItem {
  codigoProcedimento: string
  nomeProcedimento: string
  complexidade: string
  codigoGrupoHabilitacao: string
  valorSh: number
  valorSa: number
  valorSp: number
  competencia: string
}

export interface CompatibilidadeItem {
  codigoProcedimento: string
  codigoProcedimentoSecundario: string
  nomeProcedimentoSecundario: string
  registroPrincipal: string
  registroSecundario: string
  tipoCompatibilidade: string
  quantidadePermitida: number
  competencia: string
}

export interface FormaOrganizacaoItem {
  codigoGrupo: string
  codigoSubgrupo: string
  codigoForma: string
  descricao: string
  competencia: string
}

export interface ProcedimentoDescricaoItem {
  codigoProcedimento: string
  descricao: string
  competencia: string
}

// ── API ──

export const sigtapSearchApi = {
  cbos: (params: { search?: string; sort?: string; dir?: string; page?: number; pageSize?: number } = {}) =>
    api.get<PageResponse<CboItem>>(`/api/v1/sigtap/search/cbo${qs(params)}`, { withContext: true }),

  cids: (params: { search?: string; sexo?: string; agravo?: string; sort?: string; dir?: string; page?: number; pageSize?: number } = {}) =>
    api.get<PageResponse<CidItem>>(`/api/v1/sigtap/search/cid${qs(params)}`, { withContext: true }),

  procedimentos: (params: { search?: string; complexidade?: string; sexo?: string; revogado?: boolean; sort?: string; dir?: string; page?: number; pageSize?: number } = {}) =>
    api.get<PageResponse<ProcedimentoItem>>(`/api/v1/sigtap/search/procedimentos${qs(params)}`, { withContext: true }),

  cboProcedimentos: (params: { codigoCbo: string; search?: string; page?: number; pageSize?: number }) =>
    api.get<PageResponse<CboProcedimentoItem>>(`/api/v1/sigtap/search/cbo-procedimentos${qs(params)}`, { withContext: true }),

  cidProcedimentos: (params: { codigoCid: string; search?: string; page?: number; pageSize?: number }) =>
    api.get<PageResponse<CidProcedimentoItem>>(`/api/v1/sigtap/search/cid-procedimentos${qs(params)}`, { withContext: true }),

  servicos: (params: { search?: string; sort?: string; dir?: string; page?: number; pageSize?: number } = {}) =>
    api.get<PageResponse<ServicoItem>>(`/api/v1/sigtap/search/servicos${qs(params)}`, { withContext: true }),

  servicoProcedimentos: (params: { codigoServico: string; codigoClassificacao?: string; search?: string; page?: number; pageSize?: number }) =>
    api.get<PageResponse<ServicoProcedimentoItem>>(`/api/v1/sigtap/search/servico-procedimentos${qs(params)}`, { withContext: true }),

  habilitacoes: (params: { search?: string; sort?: string; dir?: string; page?: number; pageSize?: number } = {}) =>
    api.get<PageResponse<HabilitacaoItem>>(`/api/v1/sigtap/search/habilitacoes${qs(params)}`, { withContext: true }),

  habilitacaoProcedimentos: (params: { codigoHabilitacao: string; search?: string; page?: number; pageSize?: number }) =>
    api.get<PageResponse<HabilitacaoProcedimentoItem>>(`/api/v1/sigtap/search/habilitacao-procedimentos${qs(params)}`, { withContext: true }),

  compatibilidades: (params: { codigoProcedimento: string; search?: string; page?: number; pageSize?: number }) =>
    api.get<PageResponse<CompatibilidadeItem>>(`/api/v1/sigtap/search/compatibilidades${qs(params)}`, { withContext: true }),

  formasOrganizacao: (params: { search?: string; sort?: string; dir?: string; page?: number; pageSize?: number } = {}) =>
    api.get<PageResponse<FormaOrganizacaoItem>>(`/api/v1/sigtap/search/formas-organizacao${qs(params)}`, { withContext: true }),

  procedimentoDescricao: (codigo: string) =>
    api.get<ProcedimentoDescricaoItem>(`/api/v1/sigtap/search/procedimento-descricao/${codigo}`, { withContext: true }),
}
