// Gateway de IA — client tipado.
//
// Dois grupos:
// - `aiApi`: operações de consumo que qualquer módulo chama
// - `sysAiApi`: administração centralizada (MASTER). Os endpoints aceitam
//   `municipalityId` opcional — sem ele = escopo global (padrão que todos
//   municípios usam); com ele = personalização daquele município.

import { api } from './client'

const PREFIX = '/api/v1'

// ─── Tipos comuns ───────────────────────────────────────────────────────────

export type Capability =
  | 'chat' | 'chat_vision' | 'embed_text' | 'embed_image' | 'transcribe'

export type RouteScope = 'global' | 'municipality' | 'module'

export type SdkKind = 'openai' | 'openrouter' | 'anthropic' | 'ollama'

export interface AIUsageMeta {
  operationSlug: string
  providerSlug: string
  modelSlug: string
  tokensIn: number
  tokensOut: number
  totalCostCents: number
  latencyMs: number
}

export interface AIOperationResponse<T> {
  output: T
  usage: AIUsageMeta
}

interface OpArgs {
  moduleCode: string
  idempotencyKey?: string
}

async function runOp<TOut>(slug: string, inputs: unknown, args: OpArgs): Promise<AIOperationResponse<TOut>> {
  return api.post<AIOperationResponse<TOut>>(
    `${PREFIX}/ai/operations/${slug}`,
    { inputs, moduleCode: args.moduleCode, idempotencyKey: args.idempotencyKey },
    { withContext: true },
  )
}

// ─── Operations — payloads e saídas ─────────────────────────────────────────

export interface ImproveTextInput {
  text: string
  style?: 'formal' | 'neutral' | 'concise' | 'friendly'
  language?: string
}
export interface ImproveTextOutput {
  improvedText: string
  changed: boolean
}

export interface SummarizeInput {
  text: string
  maxWords?: number
  context?: string
}
export interface SummarizeOutput { summary: string }

export interface ClassifyInput {
  text: string
  labels: string[]
  allowOther?: boolean
}
export interface ClassifyOutput { label: string; confidence: number }

export interface ExtractPatientDocumentInput {
  imageUrl: string
  hintDocumentType?: 'cpf' | 'rg' | 'cnh' | 'cns' | 'passaporte' | null
}
export interface ExtractPatientDocumentOutput {
  name: string | null
  socialName: string | null
  cpf: string | null
  rg: string | null
  cns: string | null
  birthDate: string | null
  motherName: string | null
  fatherName: string | null
  detectedType: string | null
  confidence: number
}

export interface EmbedTextInput {
  inputs: string[]
  dimensions?: number
}
export interface EmbedTextOutput { vectors: number[][]; dim: number }

// ─── aiApi: consumo ────────────────────────────────────────────────────────

export const aiApi = {
  improveText: (input: ImproveTextInput, args: OpArgs) =>
    runOp<ImproveTextOutput>('improve_text', input, args),

  summarize: (input: SummarizeInput, args: OpArgs) =>
    runOp<SummarizeOutput>('summarize', input, args),

  classify: (input: ClassifyInput, args: OpArgs) =>
    runOp<ClassifyOutput>('classify', input, args),

  extractPatientDocument: (input: ExtractPatientDocumentInput, args: OpArgs) =>
    runOp<ExtractPatientDocumentOutput>('extract_patient_document', input, args),

  embedText: (input: EmbedTextInput, args: OpArgs) =>
    runOp<EmbedTextOutput>('embed_text', input, args),
}

// ─── Tipos admin (SYS) ─────────────────────────────────────────────────────

export interface AIProviderRead {
  id: string
  slug: string
  displayName: string
  sdkKind: SdkKind
  baseUrlDefault: string
  capabilities: string[]
  active: boolean
}

export interface AIProviderWrite {
  slug: string
  displayName: string
  sdkKind: SdkKind
  baseUrlDefault?: string
  capabilities: string[]
  active?: boolean
}

export interface AIModelRead {
  id: string
  providerId: string
  providerSlug: string
  slug: string
  displayName: string
  capabilities: string[]
  inputCostPerMtok: number
  outputCostPerMtok: number
  maxContext: number | null
  active: boolean
}

export interface AIModelWrite {
  providerId: string
  slug: string
  displayName: string
  capabilities: string[]
  inputCostPerMtok: number
  outputCostPerMtok: number
  maxContext: number | null
  active?: boolean
}

export interface AIMunicipalityKeyRead {
  id: string
  municipalityId: string | null  // null = chave global
  providerId: string
  providerSlug: string
  configured: boolean
  keyFingerprint: string
  keyLast4: string
  baseUrlOverride: string
  rotatedAt: string | null
  active: boolean
}

export interface AIKeyWrite {
  providerId: string
  apiKey?: string | null
  baseUrlOverride?: string
  active?: boolean
}

export interface AIRouteRead {
  id: string
  scope: RouteScope
  municipalityId: string | null
  moduleCode: string | null
  capability: string
  modelId: string
  modelSlug: string
  providerSlug: string
  priority: number
  active: boolean
}

export interface AIRouteWrite {
  scope: RouteScope
  municipalityId?: string | null
  moduleCode?: string | null
  capability: string
  modelId: string
  priority?: number
  active?: boolean
}

export interface AIQuotaRead {
  id: string
  municipalityId: string | null
  period: string
  maxTokens: number
  maxCostCents: number
  maxRequests: number
  maxPerUserTokens: number
  active: boolean
}

export interface AIQuotaWrite {
  maxTokens?: number
  maxCostCents?: number
  maxRequests?: number
  maxPerUserTokens?: number
  active?: boolean
}

export interface AIPromptTemplateRead {
  id: string
  slug: string
  version: number
  body: string
  responseSchema: unknown | null
  description: string
  active: boolean
}

export interface AIPromptTemplateWrite {
  slug: string
  version: number
  body: string
  responseSchema?: unknown | null
  description?: string
  active?: boolean
}

export interface AIUsageLogRead {
  id: string
  at: string
  municipalityId: string | null
  userId: string | null
  moduleCode: string
  operationSlug: string
  capability: string
  providerSlug: string
  modelSlug: string
  tokensIn: number
  tokensOut: number
  totalCostCents: number
  latencyMs: number
  success: boolean
  errorCode: string
  errorMessage: string
}

export interface AIUsageSummary {
  requests: number
  tokensIn: number
  tokensOut: number
  totalCostCents: number
  successCount: number
  failureCount: number
}

export interface AIUsageListResponse {
  items: AIUsageLogRead[]
  total: number
  page: number
  pageSize: number
}

export interface AIUsageFilters {
  from?: string
  to?: string
  municipalityId?: string
  capability?: string
  moduleCode?: string
  operationSlug?: string
  success?: boolean
  userId?: string
  page?: number
  pageSize?: number
}

function qs(params: Record<string, unknown>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    s.set(k, String(v))
  }
  const str = s.toString()
  return str ? `?${str}` : ''
}

// ─── sysAiApi — admin centralizado ─────────────────────────────────────────
//
// Para todos os endpoints de config (keys/routes/quotas): omita
// `municipalityId` → escopo global (padrão que todos usam). Passe um id →
// personalização daquele município.

export const sysAiApi = {
  // Catálogo — providers
  listProviders: () =>
    api.get<AIProviderRead[]>(`${PREFIX}/sys/ai/providers`),
  createProvider: (p: AIProviderWrite) =>
    api.post<AIProviderRead>(`${PREFIX}/sys/ai/providers`, p),
  updateProvider: (id: string, p: AIProviderWrite) =>
    api.put<AIProviderRead>(`${PREFIX}/sys/ai/providers/${id}`, p),
  deleteProvider: (id: string) =>
    api.delete<void>(`${PREFIX}/sys/ai/providers/${id}`),

  // Catálogo — modelos
  listModels: (providerId?: string) =>
    api.get<AIModelRead[]>(`${PREFIX}/sys/ai/models${qs({ providerId })}`),
  createModel: (m: AIModelWrite) =>
    api.post<AIModelRead>(`${PREFIX}/sys/ai/models`, m),
  updateModel: (id: string, m: AIModelWrite) =>
    api.put<AIModelRead>(`${PREFIX}/sys/ai/models/${id}`, m),
  deleteModel: (id: string) =>
    api.delete<void>(`${PREFIX}/sys/ai/models/${id}`),

  // Rotas
  listRoutes: (municipalityId?: string) =>
    api.get<AIRouteRead[]>(`${PREFIX}/sys/ai/routes${qs({ municipalityId })}`),
  putRoute: (p: AIRouteWrite) =>
    api.put<AIRouteRead>(`${PREFIX}/sys/ai/routes`, p),
  deleteRoute: (id: string) =>
    api.delete<void>(`${PREFIX}/sys/ai/routes/${id}`),

  // Chaves (global ou por município)
  listKeys: (municipalityId?: string) =>
    api.get<AIMunicipalityKeyRead[]>(`${PREFIX}/sys/ai/keys${qs({ municipalityId })}`),
  putKey: (payload: AIKeyWrite, municipalityId?: string) =>
    api.put<AIMunicipalityKeyRead>(
      `${PREFIX}/sys/ai/keys${qs({ municipalityId })}`, payload,
    ),
  deleteKey: (providerId: string, municipalityId?: string) =>
    api.delete<void>(
      `${PREFIX}/sys/ai/keys/${providerId}${qs({ municipalityId })}`,
    ),
  testKey: (providerId: string, municipalityId?: string) =>
    api.post<{ ok: boolean; detail: string }>(
      `${PREFIX}/sys/ai/keys/test${qs({ municipalityId })}`, { providerId },
    ),

  // Quotas (global ou por município)
  listQuotas: (municipalityId?: string) =>
    api.get<AIQuotaRead[]>(`${PREFIX}/sys/ai/quotas${qs({ municipalityId })}`),
  putQuota: (payload: AIQuotaWrite, municipalityId?: string) =>
    api.put<AIQuotaRead>(`${PREFIX}/sys/ai/quotas${qs({ municipalityId })}`, payload),
  deleteQuota: (municipalityId?: string) =>
    api.delete<void>(`${PREFIX}/sys/ai/quotas${qs({ municipalityId })}`),

  // Prompts
  listPrompts: () => api.get<AIPromptTemplateRead[]>(`${PREFIX}/sys/ai/prompts`),
  createPrompt: (p: AIPromptTemplateWrite) =>
    api.post<AIPromptTemplateRead>(`${PREFIX}/sys/ai/prompts`, p),
  updatePrompt: (id: string, p: AIPromptTemplateWrite) =>
    api.put<AIPromptTemplateRead>(`${PREFIX}/sys/ai/prompts/${id}`, p),
  deletePrompt: (id: string) =>
    api.delete<void>(`${PREFIX}/sys/ai/prompts/${id}`),

  // Consumo
  listUsage: (filters: AIUsageFilters = {}) =>
    api.get<AIUsageListResponse>(
      `${PREFIX}/sys/ai/usage${qs(filters as Record<string, unknown>)}`,
    ),
  usageSummary: (from?: string, to?: string, municipalityId?: string) =>
    api.get<AIUsageSummary>(
      `${PREFIX}/sys/ai/usage/summary${qs({ from, to, municipalityId })}`,
    ),

  usageTimeseries: (opts: { from?: string; to?: string; municipalityId?: string; group?: 'day' | 'week' } = {}) =>
    api.get<AITimeseriesPoint[]>(
      `${PREFIX}/sys/ai/usage/timeseries${qs(opts as Record<string, unknown>)}`,
    ),

  topOperations: (opts: { from?: string; to?: string; municipalityId?: string; limit?: number } = {}) =>
    api.get<AITopOperation[]>(
      `${PREFIX}/sys/ai/usage/top-operations${qs(opts as Record<string, unknown>)}`,
    ),
}

// ─── Tipos dashboard ────────────────────────────────────────────────────────

export interface AITimeseriesPoint {
  date: string
  requests: number
  tokensIn: number
  tokensOut: number
  totalCostCents: number
  successes: number
  failures: number
}

export interface AITopOperation {
  operationSlug: string
  requests: number
  totalCostCents: number
  totalTokens: number
}
