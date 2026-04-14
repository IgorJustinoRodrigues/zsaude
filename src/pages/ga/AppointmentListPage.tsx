import { useNavigate } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { DataTable } from '../../components/shared/DataTable'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockAppointments } from '../../mock/appointments'
import { formatDate } from '../../lib/utils'
import type { Appointment } from '../../types'

const columns = [
  {
    key: 'patient', header: 'Paciente',
    render: (a: Appointment) => (
      <div>
        <p className="text-sm font-medium">{a.patientName}</p>
        <p className="text-xs text-muted-foreground">{a.type}</p>
      </div>
    )
  },
  { key: 'date', header: 'Data / Hora', render: (a: Appointment) => <span className="text-sm">{formatDate(a.date)} {a.time}</span> },
  { key: 'specialty', header: 'Especialidade', render: (a: Appointment) => <span className="text-sm">{a.specialty}</span> },
  { key: 'professional', header: 'Profissional', render: (a: Appointment) => <span className="text-sm">{a.professionalName}</span> },
  { key: 'unit', header: 'Unidade', render: (a: Appointment) => <span className="text-sm text-muted-foreground">{a.unitName}</span> },
  { key: 'status', header: 'Status', render: (a: Appointment) => <StatusBadge status={a.status} /> },
]

export function AppointmentListPage() {
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Agendamentos"
        subtitle={`${mockAppointments.length} agendamentos`}
        actions={
          <button
            onClick={() => navigate('/ga/agendamentos/novo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <CalendarPlus size={16} /> Novo Agendamento
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={mockAppointments}
        searchable
        searchKeys={['patientName', 'specialty', 'professionalName']}
        searchPlaceholder="Buscar por paciente, especialidade..."
        onRowClick={a => navigate(`/ga/pacientes/${a.patientId}`)}
        keyExtractor={a => a.id}
      />
    </div>
  )
}
