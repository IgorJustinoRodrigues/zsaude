import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useEffectiveRecConfig } from '../../hooks/useEffectiveRecConfig'

type RecFeature = 'totem' | 'painel' | 'recepcao'

interface Props {
  feature: RecFeature
}

/**
 * Guard: bloqueia o acesso a uma feature do módulo Recepção quando ela
 * está desativada na config efetiva do escopo atual. Redireciona pra
 * raiz do módulo (``/rec``).
 *
 * Enquanto a config está carregando, mostra um loader — evita piscar a
 * tela ou redirecionar antes de saber o estado real.
 */
export function RequireRecFeature({ feature }: Props) {
  const { config, loading } = useEffectiveRecConfig()

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={18} className="text-slate-400 animate-spin" />
      </div>
    )
  }

  if (config && !config[feature].enabled) {
    return <Navigate to="/rec" replace />
  }

  return <Outlet />
}
