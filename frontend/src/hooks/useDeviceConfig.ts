// Hook que carrega a config efetiva do device em runtime e fica de olho
// em mudanças — atualmente via polling (a cada 10s); no futuro vai
// reagir a um evento ``config:changed`` publicado via WebSocket.
//
// Se o backend rejeita o token (401 — device revogado ou apagado),
// reseta o store pra voltar pra tela de pareamento.

import { useEffect, useState } from 'react'
import { HttpError } from '../api/client'
import { devicesApi, type DeviceConfigOutput } from '../api/devices'
import { useDeviceStore } from '../store/deviceStore'

const POLL_INTERVAL_MS = 10_000

export function useDeviceConfig() {
  const token = useDeviceStore(s => s.deviceToken)
  const reset = useDeviceStore(s => s.reset)
  const [config, setConfig] = useState<DeviceConfigOutput | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setConfig(null); setLoading(false); return }
    let cancelled = false

    async function tick() {
      try {
        const c = await devicesApi.getConfig(token!)
        if (!cancelled) { setConfig(c); setLoading(false) }
      } catch (e) {
        if (cancelled) return
        // Token inválido/revogado — volta pra pareamento.
        if (e instanceof HttpError && e.status === 401) {
          reset()
        }
        // Outros erros: ignora; próximo tick tenta de novo.
      }
    }

    void tick()
    const id = window.setInterval(() => { void tick() }, POLL_INTERVAL_MS)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [token, reset])

  return { config, loading }
}
