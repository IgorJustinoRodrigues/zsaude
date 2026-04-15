import { Users, CalendarCheck, Stethoscope, ListOrdered, TrendingUp, Clock, MapPin } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useAuthStore } from '../../store/authStore'
import { mockPatients } from '../../mock/patients'
import { mockAppointments } from '../../mock/appointments'
import { mockQueue, getQueueStats } from '../../mock/queue'

const NOW          = new Date()
const CURRENT_HOUR = NOW.getHours()
const TODAY        = NOW.toISOString().slice(0, 10)
const YESTERDAY    = new Date(NOW.getTime() - 86_400_000).toISOString().slice(0, 10)

// Gera distribuição pelas últimas 24h (janela deslizante a partir da hora atual)
function buildHourlyData(appts: typeof mockAppointments) {
  return Array.from({ length: 24 }, (_, i) => {
    // i=0 é a hora mais antiga (currentHour+1 de ontem), i=23 é a hora atual
    const h = (CURRENT_HOUR + 1 + i) % 24
    const isToday = i >= (23 - CURRENT_HOUR)   // horas que pertencem a hoje
    const date    = isToday ? TODAY : YESTERDAY
    const label   = `${String(h).padStart(2, '0')}h`
    const isCurrent = h === CURRENT_HOUR && isToday

    const slot = appts.filter(a => {
      const apptH = parseInt(a.time.split(':')[0])
      return a.date === date && apptH === h
    })

    return {
      hour: label,
      h,
      isCurrent,
      Agendados:      slot.filter(a => a.status === 'Agendado').length,
      Atendidos:      slot.filter(a => a.status === 'Atendido').length,
      'Em andamento': slot.filter(a => a.status === 'Em Atendimento' || a.status === 'Aguardando').length,
      Ausentes:       slot.filter(a => a.status === 'Ausente' || a.status === 'Cancelado').length,
      total:          slot.length,
    }
  })
}

// Tooltip customizado
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0)
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-4 py-3 text-xs space-y-1.5 min-w-[140px]">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{label}</p>
      {payload.map((p: any) => p.value > 0 && (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
            <span className="text-slate-500 dark:text-slate-400">{p.name}</span>
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{p.value}</span>
        </div>
      ))}
      {total > 0 && (
        <div className="flex justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <span className="text-slate-400">Total</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">{total}</span>
        </div>
      )}
    </div>
  )
}

export function OpsHomePage() {
  const { context } = useAuthStore()

  const last24hAppts  = mockAppointments.filter(a => a.date === TODAY || a.date === YESTERDAY)
  const todayAppts    = mockAppointments.filter(a => a.date === TODAY)
  const concluded     = todayAppts.filter(a => a.status === 'Atendido').length
  const inProgress    = mockQueue.filter(a => a.status === 'Em Atendimento')
  const inQueue       = mockQueue.filter(a => a.status === 'Aguardando' || a.status === 'Em Triagem')
  const priorities    = inQueue.filter(q => q.priority).length
  const totalPatients = mockPatients.filter(p => p.active).length
  const qStats        = getQueueStats()
  const hourlyData    = buildHourlyData(last24hAppts)

  const concludedPct = todayAppts.length > 0 ? Math.round((concluded / todayAppts.length) * 100) : 0
  const queuePct     = qStats.total > 0 ? Math.round((qStats.attended / qStats.total) * 100) : 0

  const now  = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const date = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard Operacional</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <MapPin size={12} className="text-slate-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {context?.facility.name ?? 'Unidade'} · {context?.municipality.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
          <Clock size={13} />
          <span className="capitalize">{date}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{now}</span>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Pacientes */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-500">
              <Users size={18} />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total</span>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{totalPatients}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Pacientes ativos</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-sky-500 font-medium">
            <TrendingUp size={12} />
            {context?.facility.shortName ?? 'Unidade'}
          </div>
        </div>

        {/* Atendimentos hoje */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-500">
              <CalendarCheck size={18} />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Hoje</span>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{todayAppts.length}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Atendimentos</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>{concluded} concluídos</span>
              <span>{concludedPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${concludedPct}%` }} />
            </div>
          </div>
        </div>

        {/* Atendimentos agora */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-500">
              <Stethoscope size={18} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500">Ao vivo</span>
            </div>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{inProgress.length}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Em atendimento</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {inProgress.slice(0, 3).map(q => (
              <span key={q.id} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                {q.sector}
              </span>
            ))}
            {inProgress.length > 3 && <span className="text-[10px] text-slate-400">+{inProgress.length - 3}</span>}
          </div>
        </div>

        {/* Pessoas na fila */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-500">
              <ListOrdered size={18} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">Ao vivo</span>
            </div>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{inQueue.length}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Na fila agora</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span className="text-amber-500 font-medium">{priorities} prioritário{priorities !== 1 ? 's' : ''}</span>
              <span>{queuePct}% atendidos</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${queuePct}%` }} />
              <div className="h-full bg-violet-500" style={{ width: `${qStats.total > 0 ? Math.round((qStats.inProgress / qStats.total) * 100) : 0}%` }} />
            </div>
          </div>
        </div>

      </div>

      {/* Hourly chart */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Distribuição por horário</h2>
            <p className="text-xs text-slate-400 mt-0.5">Atendimentos nas últimas 24 horas</p>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            {[
              { label: 'Atendidos',      color: '#10b981' },
              { label: 'Em andamento',   color: '#8b5cf6' },
              { label: 'Agendados',      color: '#0ea5e9' },
              { label: 'Ausentes',       color: '#f87171' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-slate-500 dark:text-slate-400">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourlyData} barCategoryGap="30%" barGap={2}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.06} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
              axisLine={false}
              tickLine={false}
              interval={2}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'currentColor', opacity: 0.04 }} />

            <Bar dataKey="Atendidos"    stackId="a" fill="#10b981" />
            <Bar dataKey="Em andamento" stackId="a" fill="#8b5cf6" />
            <Bar dataKey="Agendados"    stackId="a" fill="#0ea5e9" />
            <Bar dataKey="Ausentes"     stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} />
            <ReferenceLine
              x={hourlyData[23].hour}
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="4 3"
              label={{ value: 'agora', position: 'top', fontSize: 10, fill: '#f59e0b' }}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Hour indicator */}
        <div className="flex items-center justify-center gap-2 mt-3 text-[11px] text-slate-400">
          <span className="inline-block w-4 border-t-2 border-dashed border-amber-400" />
          Hora atual: <span className="font-semibold text-amber-500">{String(CURRENT_HOUR).padStart(2, '0')}h</span>
        </div>
      </div>

    </div>
  )
}
