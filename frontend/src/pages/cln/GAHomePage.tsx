import { CalendarCheck, ListOrdered, TrendingUp, Clock } from 'lucide-react'
import { StatsCard } from '../../components/shared/StatsCard'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockAppointments } from '../../mock/appointments'
import { getQueueStats } from '../../mock/queue'
import { formatDate } from '../../lib/utils'

const TODAY = '2026-04-14'
const todayAppts = mockAppointments.filter(a => a.date === TODAY)
const queueStats = getQueueStats()

export function GAHomePage() {
  const attended = todayAppts.filter(a => a.status === 'Atendido').length
  const scheduled = todayAppts.filter(a => a.status === 'Agendado').length
  const absent = todayAppts.filter(a => a.status === 'Ausente').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Gestão de Atendimento</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{formatDate(TODAY)} · Painel geral do módulo</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Atendimentos Hoje"
          value={todayAppts.length}
          icon={<CalendarCheck size={20} />}
          color="text-sky-500"
          delta={attended}
          deltaLabel="concluídos"
        />
        <StatsCard
          label="Na Fila Agora"
          value={queueStats.waiting}
          icon={<ListOrdered size={20} />}
          color="text-violet-500"
          delta={queueStats.inProgress}
          deltaLabel="em atendimento"
        />
        <StatsCard
          label="Agendados"
          value={scheduled}
          icon={<Clock size={20} />}
          color="text-amber-500"
        />
        <StatsCard
          label="Ausentes"
          value={absent}
          icon={<TrendingUp size={20} />}
          color="text-red-400"
        />
      </div>

      {/* Recent appointments + queue summary side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's appointments */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">Agendamentos de Hoje</h2>
            <a href="/cln/agendamentos" className="text-xs text-primary hover:underline">Ver todos</a>
          </div>
          <div className="divide-y divide-border">
            {todayAppts.slice(0, 8).map(a => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-sm font-mono text-muted-foreground w-12 shrink-0">{a.time}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground">{a.specialty} · {a.sector}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Queue summary */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">Fila Atual</h2>
            <a href="/cln/fila" className="text-xs text-primary hover:underline">Painel</a>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total na fila</span>
              <span className="font-semibold">{queueStats.total}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Aguardando</span>
              </div>
              <span className="font-medium">{queueStats.waiting}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-muted-foreground">Em atendimento</span>
              </div>
              <span className="font-medium">{queueStats.inProgress}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Atendidos</span>
              </div>
              <span className="font-medium">{queueStats.attended}</span>
            </div>

            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 h-full" style={{ width: `${(queueStats.attended / queueStats.total) * 100}%` }} />
              <div className="bg-violet-500 h-full" style={{ width: `${(queueStats.inProgress / queueStats.total) * 100}%` }} />
              <div className="bg-amber-500 h-full" style={{ width: `${(queueStats.waiting / queueStats.total) * 100}%` }} />
            </div>
          </div>

          <div className="px-5 pb-5">
            <a
              href="/cln/fila"
              className="block w-full text-center py-2 rounded-lg bg-sky-50 text-sky-600 text-sm font-medium hover:bg-sky-100 transition-colors"
            >
              Abrir Painel da Fila
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
