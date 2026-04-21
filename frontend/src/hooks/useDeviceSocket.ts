// Cliente WebSocket do device. Mantém a conexão aberta contra
// /api/v1/devices/ws?token=... e invoca ``onEvent`` pra cada mensagem
// recebida. Reconecta com backoff exponencial.
//
// Só roda quando o device tem ``deviceToken`` (pós-pareamento).

import { useEffect, useRef } from 'react'
import { useDeviceStore } from '../store/deviceStore'

interface DeviceEvent {
  event: string
  payload: Record<string, unknown>
}

interface Options {
  onEvent: (e: DeviceEvent) => void
  /** Quando o servidor recusa a autenticação (4401): token ruim, reset. */
  onUnauthorized?: () => void
}

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

export function useDeviceSocket({ onEvent, onUnauthorized }: Options) {
  const token = useDeviceStore(s => s.deviceToken)
  const onEventRef = useRef(onEvent)
  const onUnauthRef = useRef(onUnauthorized)
  onEventRef.current = onEvent
  onUnauthRef.current = onUnauthorized

  useEffect(() => {
    if (!token) return
    let ws: WebSocket | null = null
    let closed = false
    let backoff = MIN_BACKOFF_MS
    let retryTimer: number | null = null

    function connect() {
      if (closed) return
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const url = `${proto}://${window.location.host}/api/v1/devices/ws?token=${encodeURIComponent(token!)}`
      ws = new WebSocket(url)

      ws.onopen = () => {
        backoff = MIN_BACKOFF_MS
      }
      ws.onmessage = ev => {
        try {
          const data = JSON.parse(ev.data) as DeviceEvent
          onEventRef.current(data)
        } catch {
          // ignora payload não-JSON
        }
      }
      ws.onclose = ev => {
        if (closed) return
        // 4401 = token inválido/revogado — não tenta reconectar.
        if (ev.code === 4401) {
          onUnauthRef.current?.()
          return
        }
        // Reconexão com backoff.
        retryTimer = window.setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      }
      ws.onerror = () => {
        // onclose segue — deixa o retry do close tratar.
      }
    }

    connect()
    return () => {
      closed = true
      if (retryTimer) window.clearTimeout(retryTimer)
      if (ws) ws.close()
    }
  }, [token])
}
