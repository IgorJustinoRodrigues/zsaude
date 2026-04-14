import { useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { DataTable } from '../../components/shared/DataTable'
import { mockPatients } from '../../mock/patients'
import { formatDate, calcAge } from '../../lib/utils'
import type { Patient } from '../../types'

const columns = [
  { key: 'prontuario', header: 'Prontuário', render: (p: Patient) => <span className="font-mono text-xs text-muted-foreground">{p.prontuario}</span> },
  {
    key: 'name', header: 'Paciente',
    render: (p: Patient) => (
      <div>
        <p className="font-medium text-sm">{p.name}</p>
        <p className="text-xs text-muted-foreground">{p.cpf}</p>
      </div>
    )
  },
  { key: 'age', header: 'Idade', render: (p: Patient) => <span className="text-sm">{calcAge(p.birthDate)} anos</span> },
  { key: 'sex', header: 'Sexo', render: (p: Patient) => <span className="text-sm">{p.sex === 'F' ? 'Feminino' : 'Masculino'}</span> },
  { key: 'birthDate', header: 'Nascimento', render: (p: Patient) => <span className="text-sm">{formatDate(p.birthDate)}</span> },
  { key: 'phone', header: 'Telefone', render: (p: Patient) => <span className="text-sm">{p.cellPhone ?? p.phone}</span> },
  {
    key: 'status', header: 'Status',
    render: (p: Patient) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
        {p.active ? 'Ativo' : 'Inativo'}
      </span>
    )
  },
]

export function PatientListPage() {
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Pacientes"
        subtitle={`${mockPatients.length} pacientes cadastrados`}
        actions={
          <button
            onClick={() => navigate('/ga/pacientes/novo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus size={16} /> Novo Paciente
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={mockPatients}
        searchable
        searchKeys={['name', 'cpf', 'cns', 'prontuario']}
        searchPlaceholder="Buscar por nome, CPF, CNS ou prontuário..."
        onRowClick={p => navigate(`/ga/pacientes/${p.id}`)}
        keyExtractor={p => p.id}
      />
    </div>
  )
}
