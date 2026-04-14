import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Edit, CalendarCheck, FlaskConical, FileText } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { getPatientById } from '../../mock/patients'
import { getAppointmentsByPatient } from '../../mock/appointments'
import { getExamsByPatient } from '../../mock/exams'
import { formatDate, calcAge } from '../../lib/utils'
import { initials } from '../../lib/utils'
import { cn } from '../../lib/utils'

const TABS = ['Dados Pessoais', 'Consultas', 'Exames'] as const
type Tab = typeof TABS[number]

export function PatientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Dados Pessoais')

  const patient = getPatientById(id!)
  if (!patient) return <div className="text-center py-20 text-muted-foreground">Paciente não encontrado.</div>

  const appts = getAppointmentsByPatient(id!)
  const exams = getExamsByPatient(id!)

  return (
    <div>
      <PageHeader
        title={patient.name}
        subtitle={`Prontuário ${patient.prontuario}`}
        back="/ga/pacientes"
        actions={
          <button
            onClick={() => navigate(`/ga/pacientes/${id}/editar`)}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
          >
            <Edit size={15} /> Editar
          </button>
        }
      />

      {/* Patient header card */}
      <div className="bg-white rounded-xl border border-border p-6 mb-6 flex items-start gap-6">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary shrink-0">
          {initials(patient.name)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
          {[
            { label: 'CPF', value: patient.cpf },
            { label: 'CNS', value: patient.cns },
            { label: 'Nascimento', value: `${formatDate(patient.birthDate)} (${calcAge(patient.birthDate)} anos)` },
            { label: 'Sexo', value: patient.sex === 'F' ? 'Feminino' : 'Masculino' },
            { label: 'Tipo Sanguíneo', value: patient.bloodType ?? '—' },
            { label: 'Raça/Cor', value: patient.race },
            { label: 'Telefone', value: patient.cellPhone ?? patient.phone },
            { label: 'Unidade', value: patient.unit },
          ].map(item => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-sm font-medium mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Dados Pessoais' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-4">Dados Pessoais</h3>
            <dl className="space-y-3">
              {[
                { label: 'Nome completo', value: patient.name },
                { label: 'Nome da mãe', value: patient.motherName },
                { label: 'Nome do pai', value: patient.fatherName ?? '—' },
                { label: 'Nacionalidade', value: patient.nationality },
                { label: 'Email', value: patient.email ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-4">Endereço</h3>
            <dl className="space-y-3">
              {[
                { label: 'CEP', value: patient.address.cep },
                { label: 'Logradouro', value: `${patient.address.street}, ${patient.address.number}${patient.address.complement ? ` – ${patient.address.complement}` : ''}` },
                { label: 'Bairro', value: patient.address.neighborhood },
                { label: 'Cidade / UF', value: `${patient.address.city} / ${patient.address.state}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {tab === 'Consultas' && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {appts.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-12">Nenhuma consulta registrada.</p>
            )}
            {appts.map(a => (
              <div key={a.id} className="flex items-center gap-4 px-5 py-4">
                <CalendarCheck size={18} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{a.specialty} · {a.professionalName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(a.date)} às {a.time} · {a.unitName}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Exames' && (
        <div className="space-y-4">
          {exams.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">Nenhum exame solicitado.</p>
          )}
          {exams.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-center gap-3 mb-3">
                <FlaskConical size={18} className="text-violet-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{e.exams.length} exame{e.exams.length > 1 ? 's' : ''} solicitados</p>
                  <p className="text-xs text-muted-foreground">Solicitado em {formatDate(e.requestDate)} · {e.professionalName}</p>
                </div>
                <StatusBadge status={e.status} />
              </div>
              <div className="space-y-1 pl-7">
                {e.exams.map(ex => (
                  <div key={ex.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText size={12} />
                    <span>{ex.name}</span>
                    {ex.result && <span className={cn('font-medium', ex.abnormal ? 'text-red-600' : 'text-foreground')}>→ {ex.result} {ex.unit}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
