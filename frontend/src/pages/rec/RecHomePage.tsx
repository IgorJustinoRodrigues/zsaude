// Dashboard do módulo Recepção.
//
// Visão rápida do dia + atalhos para as telas principais: Fila (console
// da atendente), Totem (auto-atendimento) e Painel (TV de chamadas).
// Dados ainda mockados.

import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, BellRing, Clock, MonitorSmartphone, PhoneCall, Users,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { PageHeader } from '../../components/shared/PageHeader'
import { useEffectiveRecConfig } from '../../hooks/useEffectiveRecConfig'

interface Stat {
  label: string
  value: string
  hint?: string
  icon: ComponentType<{ size?: number }>
  accent: string
}

const STATS: Stat[] = [
  { label: 'Aguardando agora',    value: '7',     hint: '2 prioridade',          icon: Users,       accent: 'text-teal-600   bg-teal-50' },
  { label: 'Chamados hoje',       value: '42',    hint: 'até 14:30',             icon: PhoneCall,   accent: 'text-sky-600    bg-sky-50' },
  { label: 'Tempo médio',         value: '11min', hint: 'da chegada à chamada',  icon: Clock,       accent: 'text-violet-600 bg-violet-50' },
  { label: 'Prioridade na fila',  value: '2',     hint: 'idoso, gestante',       icon: AlertCircle, accent: 'text-red-600    bg-red-50' },
]

interface Shortcut {
  key: 'recepcao' | 'totem' | 'painel'
  title: string
  subtitle: string
  icon: ComponentType<{ size?: number }>
  to: string
}

const SHORTCUTS: Shortcut[] = [
  {
    key: 'recepcao',
    title: 'Fila de atendimento',
    subtitle: 'Console do guichê: ver fila e chamar senhas',
    icon: Users,
    to: '/rec/atendimento',
  },
  {
    key: 'totem',
    title: 'Totem',
    subtitle: 'Modo paciente — abrir na TV/tablet do hall',
    icon: MonitorSmartphone,
    to: '/rec/totem',
  },
  {
    key: 'painel',
    title: 'Painel de chamadas',
    subtitle: 'Modo TV para exibir as chamadas atuais',
    icon: BellRing,
    to: '/rec/painel',
  },
]

export function RecHomePage() {
  const navigate = useNavigate()
  const { config } = useEffectiveRecConfig()

  // Filtra atalhos pelas features habilitadas. Enquanto config ainda não
  // carregou (``null``), mostramos todos pra evitar piscar — quando chegar,
  // os desativados somem.
  const shortcuts = config
    ? SHORTCUTS.filter(s => config[s.key].enabled)
    : SHORTCUTS

  return (
    <div>
      <PageHeader title="Recepção" subtitle="Visão geral do atendimento de hoje" />

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {STATS.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${s.accent}`}>
                  <Icon size={14} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">{s.value}</p>
              {s.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</p>}
            </div>
          )
        })}
      </section>

      {/* Atalhos */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Atalhos</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {shortcuts.map(s => {
            const Icon = s.icon
            return (
              <button
                key={s.title}
                onClick={() => navigate(s.to)}
                className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
                  <Icon size={18} />
                </div>
                <h3 className="font-semibold text-sm">{s.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{s.subtitle}</p>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
