// WebSocket do usuário autenticado. Abre contra /api/v1/users/ws?token=...
// com o access token atual; reconecta com backoff exponencial; reabre
// quando o token muda (ex.: após refresh silencioso).
//
// Para consumo: passe um callback ``onEvent`` que recebe ``{event, payload}``
// — ver ``useNotificationStore.connectRealtime()`` pra exemplo.

import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'

interface UserEvent {
  event: string
  payload: Record<string, unknown>
}

interface Options {
  onEvent: (e: UserEvent) => void
}

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

function resolveWsBase(): string {
  const apiUrl = (import.meta.env.VITE_API_URL ?? '').trim()
  if (apiUrl) {
    return apiUrl.replace(/^http/i, 'ws').replace(/\/+$/, '')
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}`
}

export function useUserSocket({ onEvent }: Options) {
  const token = useAuthStore(s => s.accessToken)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!token) return
    let ws: WebSocket | null = null
    let closed = false
    let backoff = MIN_BACKOFF_MS
    let retryTimer: number | null = null

    function connect() {
      if (closed) return
      const url = `${resolveWsBase()}/api/v1/users/ws?token=${encodeURIComponent(token!)}`
      ws = new WebSocket(url)

      ws.onopen = () => { backoff = MIN_BACKOFF_MS }
      ws.onmessage = ev => {
        try {
          const data = JSON.parse(ev.data) as UserEvent
          onEventRef.current(data)
        } catch {
          // ignora payloads não-JSON
        }
      }
      ws.onclose = ev => {
        if (closed) return
        // 4401 = token expirou/inválido. authStore eventualmente faz
        // refresh e atualiza o token — quando isso acontece, o effect
        // reroda com o token novo e reconecta. Aqui só evita loop
        // agressivo até lá.
        if (ev.code === 4401) {
          retryTimer = window.setTimeout(connect, 5_000)
          return
        }
        retryTimer = window.setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      }
      ws.onerror = () => { /* onclose trata a retry */ }
    }

    connect()
    return () => {
      closed = true
      if (retryTimer) window.clearTimeout(retryTimer)
      if (ws) ws.close()
    }
  }, [token])
}
