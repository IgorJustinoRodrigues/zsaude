import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { useQueueStore } from '../../store/queueStore'
import { cn } from '../../lib/utils'
import type { TriageRisk } from '../../types'

const SECTORS = ['Todos', 'Clínica Médica', 'Cardiologia', 'Ginecologia', 'Ortopedia', 'Pediatria', 'Neurologia', 'Enfermagem', 'Psicologia']

const RISK_COLORS: Record<TriageRisk, string> = {
  'Imediato': 'bg-red-600',
  'Muito Urgente': 'bg-orange-500',
  'Urgente': 'bg-yellow-400',
  'Pouco Urgente': 'bg-emerald-500',
  'Não Urgente': 'bg-blue-500',
}

export function QueuePage() {
  const { entries, advanceRandom } = useQueueStore()
  const [sector, setSector] = useState('Todos')
  const [lastUpdate, setLastUpdate] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      advanceRandom()
      setLastUpdate(new Date())
    }, 20000)
    return () => clearInterval(interval)
  }, [advanceRandom])

  const filtered = sector === 'Todos' ? entries : entries.filter(e => e.sector === sector)
  const waiting = filtered.filter(e => e.status === 'Aguardando').length
  const inProgress = filtered.filter(e => ['Em Triagem', 'Em Atendimento'].includes(e.status)).length
  const attended = filtered.filter(e => e.status === 'Atendido').length

  return (
    <div>
      <PageHeader
        title="Fila de Atendimento"
        subtitle={`Atualizado em ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        actions={
          <button
            onClick={() => { advanceRandom(); setLastUpdate(new Date()) }}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{waiting}</p>
          <p className="text-sm text-amber-700 mt-1">Aguardando</p>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-violet-600">{inProgress}</p>
          <p className="text-sm text-violet-700 mt-1">Em Atendimento</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-emerald-600">{attended}</p>
          <p className="text-sm text-emerald-700 mt-1">Atendidos</p>
        </div>
      </div>

      {/* Sector filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-thin">
        {SECTORS.map(s => (
          <button
            key={s}
            onClick={() => setSector(s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              sector === s ? 'bg-primary text-primary-foreground' : 'bg-white border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Queue cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(entry => (
          <div
            key={entry.id}
            className={cn(
              'bg-white rounded-xl border p-4 transition-all',
              entry.status === 'Atendido' ? 'opacity-50 border-border' :
              entry.status === 'Em Atendimento' ? 'border-violet-300 shadow-sm shadow-violet-100' :
              entry.status === 'Em Triagem' ? 'border-orange-300 shadow-sm shadow-orange-100' :
              entry.priority ? 'border-amber-300 shadow-sm shadow-amber-100' : 'border-border'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono text-primary">{entry.ticket}</span>
                {entry.priority && <AlertTriangle size={14} className="text-amber-500" />}
              </div>
              <StatusBadge status={entry.status} />
            </div>

            <p className="text-sm font-medium">{entry.patientName}</p>
            <p className="text-xs text-muted-foreground">{entry.patientAge} anos · Chegada: {entry.arrivalTime}</p>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">{entry.sector}</span>
              {entry.triageRisk ? (
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white', RISK_COLORS[entry.triageRisk])}>
                  {entry.triageRisk}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Sem triagem</span>
              )}
            </div>

            {entry.status === 'Aguardando' && entry.waitMinutes > 0 && (
              <p className="text-xs text-amber-600 mt-2">⏱ {entry.waitMinutes} min. de espera</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
