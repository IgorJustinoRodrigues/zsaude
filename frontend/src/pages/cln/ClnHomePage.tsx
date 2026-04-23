// Home do módulo Clínico — landing com resumo das filas e atalhos.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Stethoscope, Users } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { clnApi, type EffectiveClnConfig } from '../../api/cln'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'

export function ClnHomePage() {
  const [config, setConfig] = useState<EffectiveClnConfig | null>(null)
  const [triagemCount, setTriagemCount] = useState<number | null>(null)
  const [atendimentoCount, setAtendimentoCount] = useState<number | null>(null)

  useEffect(() => {
    void clnApi.effectiveConfig().then(setConfig).catch(e => {
      if (e instanceof HttpError) toast.error('Config CLN', e.message)
    })
    void clnApi.listTriagem().then(r => setTriagemCount(r.length)).catch(() => {})
    void clnApi.listAtendimento().then(r => setAtendimentoCount(r.length)).catch(() => {})
  }, [])

  return (
    <div>
      <PageHeader title="Clínica" subtitle="Fila pós-recepção (triagem e atendimento)." />

      {config && !config.enabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-4 mb-4 text-sm text-amber-900 dark:text-amber-200">
          O módulo está <strong>desativado</strong> nesta unidade. Peça ao
          administrador pra ativar em <em>Sys → CLN</em>.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {config?.enabled && config.triagemEnabled && (
          <QueueCard
            to="/cln/triagem"
            icon={<Stethoscope size={22} />}
            title="Triagem"
            subtitle={config.triagemSectorName ?? 'setor não configurado'}
            count={triagemCount}
            tone="sky"
            disabled={!config.triagemSectorName}
          />
        )}
        {config?.enabled && (
          <QueueCard
            to="/cln/atendimento"
            icon={<Users size={22} />}
            title="Atendimento"
            subtitle={config.atendimentoSectorName ?? 'setor não configurado'}
            count={atendimentoCount}
            tone="emerald"
            disabled={!config.atendimentoSectorName}
          />
        )}
      </div>
    </div>
  )
}

function QueueCard({
  to, icon, title, subtitle, count, tone, disabled,
}: {
  to: string
  icon: React.ReactNode
  title: string
  subtitle: string
  count: number | null
  tone: 'sky' | 'emerald'
  disabled: boolean
}) {
  const toneClass = tone === 'sky'
    ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300'
    : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
  return (
    <Link
      to={disabled ? '#' : to}
      aria-disabled={disabled}
      className={`group rounded-xl border border-border bg-card p-5 transition-all ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${toneClass}`}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold">{title}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
        </div>
        {count !== null && (
          <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-bold tabular-nums">
            {count}
          </span>
        )}
      </div>
      {!disabled && (
        <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary group-hover:gap-2 transition-all">
          Abrir fila <ArrowRight size={13} />
        </div>
      )}
    </Link>
  )
}
