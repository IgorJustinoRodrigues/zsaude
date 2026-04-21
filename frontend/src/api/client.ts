// Cliente HTTP fino com auto-refresh de token.
//
// A lógica de tokens vive no authStore (persiste em localStorage).
// O client lê/escreve tokens via getters/setters injetados, evitando
// importar o store diretamente (que importaria isso de volta).

const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '')

export interface ApiError {
  code: string
  message: string
  status: number
  errors?: unknown
  /** Payload estruturado extra que o backend anexa em certos erros
   *  (ex.: 409 com ``existingTicket``). */
  details?: Record<string, unknown>
}

export class HttpError extends Error {
  code: string
  status: number
  errors?: unknown
  details?: Record<string, unknown>
  constructor(e: ApiError) {
    super(e.message)
    this.code = e.code
    this.status = e.status
    this.errors = e.errors
    this.details = e.details
  }
}

// ─── Token storage injection ──────────────────────────────────────────────────
// Setado pelo authStore durante a inicialização.

interface TokenStore {
  getAccess: () => string | null
  getRefresh: () => string | null
  getContext: () => string | null
  setTokens: (access: string, refresh: string) => void
  clear: () => void
  onRefreshFailure: () => void
}

let tokenStore: TokenStore | null = null

export function setTokenStore(store: TokenStore) {
  tokenStore = store
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

interface ApiOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown
  headers?: Record<string, string>
  /** Se true, não adiciona Authorization. */
  anonymous?: boolean
  /** Se true, adiciona X-Work-Context (se disponível). */
  withContext?: boolean
  /** Interno — evita loop de refresh. */
  _retried?: boolean
}

async function parseError(res: Response): Promise<HttpError> {
  let code = 'http_error'
  let message = res.statusText || 'Erro na requisição.'
  let errors: unknown
  let details: Record<string, unknown> | undefined
  try {
    const data = await res.json()
    if (data && typeof data === 'object') {
      if (typeof data.code === 'string') code = data.code
      if (typeof data.message === 'string') message = data.message
      errors = data.errors
      if (data.details && typeof data.details === 'object') {
        details = data.details as Record<string, unknown>
      }
    }
  } catch {
    /* resposta não era JSON */
  }
  return new HttpError({ code, message, status: res.status, errors, details })
}

export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, headers = {}, anonymous, withContext, _retried, ...rest } = opts

  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers }

  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json'
  }

  if (!anonymous && tokenStore) {
    const access = tokenStore.getAccess()
    if (access) finalHeaders['Authorization'] = `Bearer ${access}`
  }

  if (withContext && tokenStore) {
    const ctx = tokenStore.getContext()
    if (ctx) finalHeaders['X-Work-Context'] = ctx
  }

  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })

  if (res.ok) {
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  // 401 → tenta refresh uma única vez
  if (res.status === 401 && !anonymous && !_retried && tokenStore) {
    const refreshed = await tryRefresh()
    if (refreshed) return apiFetch<T>(path, { ...opts, _retried: true })
  }

  throw await parseError(res)
}

// ─── Refresh automático ──────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!tokenStore) return false
  if (refreshPromise) return refreshPromise

  const refresh = tokenStore.getRefresh()
  if (!refresh) return false

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      })
      if (!res.ok) {
        tokenStore!.clear()
        tokenStore!.onRefreshFailure()
        return false
      }
      const data = await res.json()
      tokenStore!.setTokens(data.accessToken, data.refreshToken)
      return true
    } catch {
      tokenStore!.clear()
      tokenStore!.onRefreshFailure()
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// ─── Blob fetch (imagens, downloads) ─────────────────────────────────────────

/**
 * Igual ao apiFetch mas retorna um Blob em vez de JSON. Usado para servir
 * imagens autenticadas em <img> via URL.createObjectURL.
 */
export async function apiFetchBlob(
  path: string,
  opts: { withContext?: boolean } = {},
): Promise<Blob> {
  const headers: Record<string, string> = {}

  if (tokenStore) {
    const access = tokenStore.getAccess()
    if (access) headers['Authorization'] = `Bearer ${access}`
    if (opts.withContext) {
      const ctx = tokenStore.getContext()
      if (ctx) headers['X-Work-Context'] = ctx
    }
  }

  const url = `${BASE_URL}${path}`
  let res = await fetch(url, { headers })

  if (res.status === 401 && tokenStore) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      const access = tokenStore.getAccess()
      if (access) headers['Authorization'] = `Bearer ${access}`
      res = await fetch(url, { headers })
    }
  }

  if (!res.ok) throw await parseError(res)
  return res.blob()
}

// ─── Atalhos ────────────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, opts?: Omit<ApiOptions, 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<ApiOptions, 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<ApiOptions, 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<ApiOptions, 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: Omit<ApiOptions, 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'DELETE' }),
}
