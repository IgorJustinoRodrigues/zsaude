import { PageHeader } from '../../components/shared/PageHeader'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockExamRequests } from '../../mock/exams'
import { formatDate } from '../../lib/utils'
import { cn } from '../../lib/utils'

const released = mockExamRequests.filter(e => e.status === 'Resultado Liberado')

export function LabReportPage() {
  return (
    <div>
      <PageHeader title="Laudos" subtitle={`${released.length} laudos liberados`} />

      <div className="space-y-4">
        {released.map(e => (
          <div key={e.id} className="bg-white rounded-xl border border-border p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold">{e.patientName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Solicitado em {formatDate(e.requestDate)} · Liberado em {e.releaseDate ? formatDate(e.releaseDate) : '—'}
                </p>
              </div>
              <StatusBadge status={e.status} />
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exame</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resultado</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Referência</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Situação</th>
                </tr>
              </thead>
              <tbody>
                {e.exams.map(ex => (
                  <tr key={ex.id} className="border-b border-border last:border-0">
                    <td className="py-2.5">{ex.name}</td>
                    <td className={cn('py-2.5 font-medium', ex.abnormal ? 'text-red-600' : '')}>
                      {ex.result ? `${ex.result} ${ex.unit}` : '—'}
                    </td>
                    <td className="py-2.5 text-muted-foreground text-xs">{ex.referenceValue}</td>
                    <td className="py-2.5">
                      {ex.abnormal !== undefined && (
                        <span className={cn('text-xs font-medium', ex.abnormal ? 'text-red-600' : 'text-emerald-600')}>
                          {ex.abnormal ? 'Alterado' : 'Normal'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-xs text-muted-foreground mt-3">
              Solicitante: {e.professionalName} · {e.unitName}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
