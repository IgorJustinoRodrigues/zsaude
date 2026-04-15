import { PageHeader } from '../../components/shared/PageHeader'
import { mockAppointments } from '../../mock/appointments'
import { mockProfessionals } from '../../mock/professionals'
import { formatDate } from '../../lib/utils'

const TODAY = '2026-04-14'

export function ProductionPage() {
  const todayAppts = mockAppointments.filter(a => a.date === TODAY && a.status === 'Atendido')

  const byProfessional = mockProfessionals.map(pr => ({
    professional: pr,
    count: todayAppts.filter(a => a.professionalId === pr.id).length,
  })).filter(r => r.count > 0)

  return (
    <div>
      <PageHeader
        title="Produção Individual"
        subtitle={`Data: ${formatDate(TODAY)}`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Total atendimentos hoje</p>
          <p className="text-3xl font-bold mt-1">{todayAppts.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Profissionais ativos hoje</p>
          <p className="text-3xl font-bold mt-1">{byProfessional.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Produção por Profissional</h2>
        </div>
        <div className="divide-y divide-border">
          {byProfessional.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">Nenhum atendimento registrado hoje.</p>
          )}
          {byProfessional.map(({ professional, count }) => (
            <div key={professional.id} className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{professional.name}</p>
                <p className="text-xs text-muted-foreground">{professional.specialty}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${Math.min(100, count * 20)}%` }} />
                </div>
                <span className="text-sm font-semibold w-8 text-right">{count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
