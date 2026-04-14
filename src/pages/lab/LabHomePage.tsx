import { FlaskConical, ClipboardList, CheckCircle, Clock } from 'lucide-react'
import { StatsCard } from '../../components/shared/StatsCard'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockExamRequests } from '../../mock/exams'
import { formatDate } from '../../lib/utils'

export function LabHomePage() {
  const total = mockExamRequests.length
  const pending = mockExamRequests.filter(e => ['Solicitado', 'Coletado', 'Em Análise'].includes(e.status)).length
  const released = mockExamRequests.filter(e => e.status === 'Resultado Liberado').length
  const urgent = mockExamRequests.filter(e => e.urgency).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Laboratório</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Dashboard do módulo de exames</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard label="Total de Pedidos" value={total} icon={<ClipboardList size={20} />} color="text-violet-500" />
        <StatsCard label="Em Andamento" value={pending} icon={<Clock size={20} />} color="text-amber-500" />
        <StatsCard label="Laudos Liberados" value={released} icon={<CheckCircle size={20} />} color="text-emerald-500" />
        <StatsCard label="Urgentes" value={urgent} icon={<FlaskConical size={20} />} color="text-red-400" />
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pedidos Recentes</h2>
          <a href="/lab/pedidos" className="text-xs text-primary hover:underline">Ver todos</a>
        </div>
        <div className="divide-y divide-border">
          {mockExamRequests.map(e => (
            <div key={e.id} className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{e.patientName}</p>
                  {e.urgency && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Urgente</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {e.exams.length} exame{e.exams.length > 1 ? 's' : ''} · {formatDate(e.requestDate)} · {e.professionalName}
                </p>
              </div>
              <StatusBadge status={e.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
