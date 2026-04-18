import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { Cake, Sparkles, Heart, Activity, Users, LogIn, LayoutGrid, X } from 'lucide-react'
import type { AnniversaryResponse } from '../../api/auth'
import { labelModule } from '../../lib/auditLabels'

interface Props {
  data: AnniversaryResponse
  onClose: () => void
}

/**
 * Modal comemorativo de aniversário — mostra mensagem personalizada,
 * estatísticas de uso do último ano e anima confetti na abertura.
 *
 * Chamadas de ``confetti()`` são stateless: em diferentes momentos
 * disparamos bursts distintos pra dar sensação de "festa".
 */
export function BirthdayModal({ data, onClose }: Props) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    // Rajada inicial — centro, duração curta.
    confetti({
      particleCount: 120,
      spread: 90,
      origin: { x: 0.5, y: 0.3 },
      colors: ['#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6'],
    })

    // Rajadas laterais 300ms depois — efeito de "canhões".
    const t1 = setTimeout(() => {
      confetti({ particleCount: 80, angle: 60,  spread: 70, origin: { x: 0,   y: 0.6 } })
      confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1,   y: 0.6 } })
    }, 300)

    // Última rajada — bem sutil.
    const t2 = setTimeout(() => {
      confetti({ particleCount: 60, spread: 100, origin: { x: 0.5, y: 0.4 }, scalar: 0.9 })
    }, 900)

    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const { firstName, age, stats } = data
  const modulo = stats.mostUsedModule ? labelModule(stats.mostUsedModule) : null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative bg-gradient-to-br from-amber-50 via-pink-50 to-violet-50 dark:from-amber-950/60 dark:via-pink-950/50 dark:to-violet-950/60 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-pink-200 dark:border-pink-900"
      >
        {/* Fecha */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Cabeçalho — bolo em destaque */}
        <div className="px-6 pt-10 pb-5 text-center">
          <div className="relative inline-block">
            <div className="absolute -top-4 -left-4 text-amber-400 animate-pulse">
              <Sparkles size={20} />
            </div>
            <div className="absolute -top-2 -right-5 text-pink-400 animate-pulse" style={{ animationDelay: '0.3s' }}>
              <Sparkles size={16} />
            </div>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-400 via-amber-300 to-violet-400 flex items-center justify-center shadow-lg">
              <Cake size={48} className="text-white" strokeWidth={1.5} />
            </div>
          </div>

          <h2 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Parabéns, {firstName || 'você'}! 🎉
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm mx-auto">
            {age !== null ? (
              <>Feliz aniversário — <strong>{age} anos</strong> de muita saúde!</>
            ) : (
              <>Feliz aniversário! Um dia especial pra você.</>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            No último ano você <strong>fez a diferença</strong> na zSaúde.
            Obrigado por estar com a gente. 💙
          </p>
        </div>

        {/* Métricas */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={<Activity size={18} />}
              value={stats.totalActions.toLocaleString('pt-BR')}
              label={stats.totalActions === 1 ? 'ação registrada' : 'ações registradas'}
              tone="sky"
            />
            <MetricCard
              icon={<LogIn size={18} />}
              value={stats.daysActive.toLocaleString('pt-BR')}
              label={stats.daysActive === 1 ? 'dia ativo' : 'dias ativos'}
              tone="emerald"
            />
            <MetricCard
              icon={<Users size={18} />}
              value={stats.patientsTouched.toLocaleString('pt-BR')}
              label={stats.patientsTouched === 1 ? 'paciente atendido' : 'pacientes atendidos'}
              tone="pink"
            />
            <MetricCard
              icon={<LayoutGrid size={18} />}
              value={modulo || '—'}
              label="módulo mais usado"
              tone="violet"
              compact
            />
          </div>

          {stats.totalActions === 0 && (
            <p className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400 italic">
              Ainda estamos no comecinho juntos — o próximo ano vai render muita história.
            </p>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 pb-6 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all"
          >
            <Heart size={14} fill="currentColor" />
            Obrigado!
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Building blocks ──────────────────────────────────────────────────────────

function MetricCard({
  icon, value, label, tone, compact = false,
}: {
  icon: React.ReactNode
  value: string
  label: string
  tone: 'sky' | 'emerald' | 'pink' | 'violet'
  compact?: boolean
}) {
  const toneClasses: Record<string, string> = {
    sky:     'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    pink:    'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
    violet:  'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  }
  return (
    <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur rounded-xl p-3 border border-white/60 dark:border-slate-800">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${toneClasses[tone]}`}>
        {icon}
      </div>
      <p className={`mt-2 font-bold text-slate-800 dark:text-slate-100 ${compact ? 'text-sm' : 'text-2xl'}`}>
        {value}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
    </div>
  )
}
