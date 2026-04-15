import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

/**
 * Usado em /login: se já autenticado, redireciona para o destino apropriado:
 * - se já selecionou módulo ativo → /{módulo}
 * - se tem contexto mas não módulo → /selecionar-sistema
 * - se autenticado mas sem contexto → /selecionar-contexto
 */
export function RedirectIfAuthed() {
  const { isAuthenticated, context, currentSystem } = useAuthStore()

  if (isAuthenticated) {
    if (context && currentSystem && context.modules.includes(currentSystem)) {
      return <Navigate to={`/${currentSystem}`} replace />
    }
    if (context) {
      return <Navigate to="/selecionar-sistema" replace />
    }
    return <Navigate to="/selecionar-contexto" replace />
  }
  return <Outlet />
}
