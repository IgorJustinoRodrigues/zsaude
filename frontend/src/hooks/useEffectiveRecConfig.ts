// Hook que retorna a config efetiva do módulo Recepção para o contexto
// ativo (município + unidade do authStore).
//
// Uso típico: esconder features desativadas na sidebar e no dashboard.
//   const { config } = useEffectiveRecConfig()
//   if (config?.totem.enabled) { ... }
//
// Sem contexto, retorna ``null`` (o componente decide o fallback).

import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { recConfigApi, type EffectiveRecConfig } from '../api/recConfig'

export function useEffectiveRecConfig() {
  const facilityId = useAuthStore(s => s.context?.facility.id)
  const [config, setConfig] = useState<EffectiveRecConfig | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!facilityId) {
      setConfig(null)
      return
    }
    let cancelled = false
    setLoading(true)
    recConfigApi
      .effective({ facilityId })
      .then(c => { if (!cancelled) setConfig(c) })
      .catch(() => { /* silencioso: usa fallback (tudo escondido) */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [facilityId])

  return { config, loading }
}
