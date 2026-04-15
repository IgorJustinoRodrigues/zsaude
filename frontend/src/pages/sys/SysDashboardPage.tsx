import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Building2, Users, ShieldAlert, Activity, ArrowRight,
} from 'lucide-react'
import { sysApi, type MunicipalityAdminDetail } from '../../api/sys'
import { userApi, type UserStats } from '../../api/users'
import { cn } from '../../lib/utils'

export function SysDashboardPage() {
  const navigate = useNavigate()
  const [muns, setMuns] = useState<MunicipalityAdminDetail[]>([])
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([sysApi.listMunicipalities(true), userApi.stats()])
      .then(([m, s]) => { setMuns(m); setUserStats(s) })
      .finally(() => setLoading(false))
  }, [])

  const activeMuns   = muns.filter(m => !m.archived).length
  const archivedMuns = muns.filter(m =>  m.archived).length
  const totalFac     = muns.reduce((s, m) => s + m.facilityCount, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin w-6 h-6 text-violet-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard da plataforma</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Visão geral dos municípios, unidades e usuários administrativos.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<MapPin size={18} />}
          label="Municípios ativos"
          value={activeMuns}
          extra={archivedMuns > 0 ? `+ ${archivedMuns} arquivados` : undefined}
          color="violet"
          onClick={() => navigate('/sys/municipios')}
        />
        <StatCard
          icon={<Building2 size={18} />}
          label="Unidades cadastradas"
          value={totalFac}
          color="sky"
          onClick={() => navigate('/sys/unidades')}
        />
        <StatCard
          icon={<Users size={18} />}
          label="Usuários no sistema"
          value={userStats?.total ?? 0}
          extra={`${userStats?.ativo ?? 0} ativos`}
          color="emerald"
          onClick={() => navigate('/sys/usuarios')}
        />
        <StatCard
          icon={<ShieldAlert size={18} />}
          label="Usuários bloqueados"
          value={userStats?.bloqueado ?? 0}
          color="red"
        />
      </div>

      {/* Municípios em destaque */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Municípios</h2>
          <button
            onClick={() => navigate('/sys/municipios')}
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors"
          >
            Ver todos <ArrowRight size={11} />
          </button>
        </div>
        {muns.length === 0 ? (
          <div className="text-center py-10">
            <MapPin size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm text-slate-500">Nenhum município cadastrado.</p>
            <button
              onClick={() => navigate('/sys/municipios/novo')}
              className="mt-3 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Cadastrar primeiro município
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {muns.slice(0, 5).map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/sys/municipios/${m.id}`)}
                className="w-full flex items-center gap-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors px-2 -mx-2 rounded-lg"
              >
                <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-500 flex items-center justify-center shrink-0">
                  <MapPin size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {m.name}
                    {m.archived && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 uppercase tracking-widest">Arquivado</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {m.state} · IBGE {m.ibge} · schema {m.schemaName}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-xs text-slate-500">
                    {m.facilityCount} unidade{m.facilityCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {m.userCount} usuário{m.userCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <ArrowRight size={13} className="text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Atividade — atalho pros logs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={15} className="text-violet-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Auditoria</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Consulte logs de ações realizadas na plataforma, incluindo operações MASTER.
        </p>
        <button
          onClick={() => navigate('/sys/logs')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
        >
          <ScrollIcon />
          Abrir logs
        </button>
      </div>
    </div>
  )
}

function ScrollIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" />
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
    </svg>
  )
}

function StatCard({
  icon, label, value, extra, color, onClick,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  extra?: string
  color: 'violet' | 'sky' | 'emerald' | 'red'
  onClick?: () => void
}) {
  const colorCls = {
    violet:  'bg-violet-50 text-violet-500 dark:bg-violet-950/50 dark:text-violet-400',
    sky:     'bg-sky-50 text-sky-500 dark:bg-sky-950/50 dark:text-sky-400',
    emerald: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-400',
    red:     'bg-red-50 text-red-500 dark:bg-red-950/50 dark:text-red-400',
  }[color]

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-left transition-all',
        onClick && 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colorCls)}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{label}</p>
      {extra && <p className="text-[10px] text-slate-400 mt-0.5">{extra}</p>}
    </button>
  )
}
