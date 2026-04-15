import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'
import { Toaster } from '../ui/Toaster'

const VALID_MODULES: SystemId[] = ['cln', 'dgn', 'hsp', 'pln', 'fsc', 'ops']

export function AppShell() {
  const { sidebarCollapsed } = useUIStore()
  const { currentSystem, selectSystem } = useAuthStore()
  const { pathname } = useLocation()

  // Módulo da URL atual (se for um segmento de módulo válido).
  const segment = pathname.split('/')[1] as SystemId
  const urlModule = VALID_MODULES.includes(segment) ? segment : null

  // Mantém o menu do módulo mesmo em telas compartilhadas (/usuarios,
  // /notificacoes): usa a URL quando há um módulo, senão o último escolhido.
  const currentModule: SystemId | null = urlModule ?? currentSystem ?? null

  // Sincroniza o módulo ativo no store quando o usuário entra num módulo
  // por navegação direta (ex.: botão "Trocar módulo" que pula a tela de
  // seleção). Evita divergência entre URL e sidebar.
  useEffect(() => {
    if (urlModule && urlModule !== currentSystem) {
      selectSystem(urlModule)
    }
  }, [urlModule, currentSystem, selectSystem])

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar module={currentModule} />
      <div
        className={cn(
          'flex flex-col flex-1 min-w-0 transition-all duration-200',
          'ml-0',
          'md:ml-16',
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}
      >
        <TopBar module={currentModule} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>

      <Toaster />
    </div>
  )
}
