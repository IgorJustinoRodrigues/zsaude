import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockAppointments } from '../../mock/appointments'
import { formatDate } from '../../lib/utils'

const attended = mockAppointments.filter(a => a.status === 'Atendido' || a.status === 'Em Atendimento')

export function ConsultationListPage() {
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Prontuário Eletrônico"
        subtitle="Consultas realizadas e em andamento"
      />

      <div className="space-y-3">
        {attended.map(a => (
          <div
            key={a.id}
            onClick={() => navigate(`/ga/pacientes/${a.patientId}`)}
            className="bg-white rounded-xl border border-border p-5 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
          >
            <FileText size={20} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{a.patientName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {a.specialty} · {a.professionalName} · {formatDate(a.date)} às {a.time}
              </p>
            </div>
            <StatusBadge status={a.status} />
          </div>
        ))}
      </div>
    </div>
  )
}
