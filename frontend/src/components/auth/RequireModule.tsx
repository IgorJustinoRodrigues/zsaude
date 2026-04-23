import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import type { SystemId } from '../../types'

const VALID_MODULES: SystemId[] = ['cln', 'dgn', 'hsp', 'pln', 'fsc', 'ops', 'ind', 'rec', 'esu']

interface Props {
  /** Se informado, força validação para este módulo. Caso contrário, lê da URL (/:module). */
  moduleId?: SystemId
}

/**
 * Guard: exige que o módulo (derivado da URL ou recebido por prop) esteja
 * na lista de módulos do contexto ativo. Caso contrário, manda para a tela
 * de seleção de sistema; se o módulo nem sequer é válido, manda para 403.
 */
export function RequireModule({ moduleId }: Props) {
  const { context } = useAuthStore()
  const location = useLocation()

  // Deriva o módulo da URL se não vier por prop: /cln/... → 'cln'
  const fromUrl = location.pathname.split('/')[1] as SystemId
  const target = moduleId ?? fromUrl

  if (!VALID_MODULES.includes(target)) {
    return <Navigate to="/403" replace />
  }
  if (!context) {
    return <Navigate to="/selecionar-acesso" replace />
  }
  if (!context.modules.includes(target)) {
    // Módulo pode ter sumido por contexto stale (role/permissões mudaram
    // depois que o token foi emitido). Força re-seleção pra emitir um
    // token novo — se ainda assim não tiver o módulo, o SystemSelect
    // mostra só o que existe e o 403 real cai num caminho manual.
    return <Navigate to="/selecionar-acesso" replace state={{ attempted: target }} />
  }
  return <Outlet />
}
