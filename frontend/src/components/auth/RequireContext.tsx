import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

/** Guard: exige contexto de trabalho (município/unidade) selecionado. */
export function RequireContext() {
  const { context, contextToken } = useAuthStore()
  if (!context || !contextToken) {
    return <Navigate to="/selecionar-contexto" replace />
  }
  return <Outlet />
}
