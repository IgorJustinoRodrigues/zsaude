import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { DataTable } from '../../components/shared/DataTable'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockExamRequests } from '../../mock/exams'
import { formatDate } from '../../lib/utils'
import type { ExamRequest } from '../../types'

const columns = [
  {
    key: 'patient', header: 'Paciente',
    render: (e: ExamRequest) => (
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{e.patientName}</p>
          {e.urgency && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Urgente</span>}
        </div>
        <p className="text-xs text-muted-foreground">{e.unitName}</p>
      </div>
    )
  },
  { key: 'exams', header: 'Exames', render: (e: ExamRequest) => <span className="text-sm">{e.exams.map(ex => ex.name).join(', ')}</span> },
  { key: 'requestDate', header: 'Solicitação', render: (e: ExamRequest) => <span className="text-sm">{formatDate(e.requestDate)}</span> },
  { key: 'professional', header: 'Solicitante', render: (e: ExamRequest) => <span className="text-sm text-muted-foreground">{e.professionalName}</span> },
  { key: 'status', header: 'Status', render: (e: ExamRequest) => <StatusBadge status={e.status} /> },
]

export function ExamRequestListPage() {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader
        title="Pedidos de Exame"
        subtitle={`${mockExamRequests.length} pedidos`}
        actions={
          <button
            onClick={() => navigate('/dgn/pedidos/novo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} /> Novo Pedido
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={mockExamRequests}
        searchable
        searchKeys={['patientName', 'professionalName']}
        searchPlaceholder="Buscar por paciente ou solicitante..."
        keyExtractor={e => e.id}
      />
    </div>
  )
}
