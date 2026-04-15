import { BedDouble, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { StatsCard } from '../../components/shared/StatsCard'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockAdmissions } from '../../mock/admissions'
import { formatDate } from '../../lib/utils'

export function AIHHomePage() {
  const internados = mockAdmissions.filter(a => a.status === 'Internado').length
  const altas = mockAdmissions.filter(a => a.status === 'Alta').length
  const solicitadas = mockAdmissions.filter(a => a.status === 'Solicitada').length
  const navigate = useNavigate()

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">AIH – Autorização de Internação Hospitalar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestão de internações hospitalares</p>
        </div>
        <button
          onClick={() => navigate('/hsp/internacoes/novo')}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
        >
          <Plus size={16} /> Nova AIH
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatsCard label="Internados" value={internados} icon={<BedDouble size={20} />} color="text-amber-500" />
        <StatsCard label="Altas Hoje" value={altas} icon={<BedDouble size={20} />} color="text-emerald-500" />
        <StatsCard label="Solicitações Pendentes" value={solicitadas} icon={<BedDouble size={20} />} color="text-blue-500" />
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Internações</h2>
        </div>
        <div className="divide-y divide-border">
          {mockAdmissions.map(a => (
            <div key={a.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{a.patientName}</p>
                  <span className="text-xs text-muted-foreground font-mono">AIH {a.aihNumber}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.diagnosis} ({a.cidCode}) · {formatDate(a.admissionDate)}
                  {a.bed ? ` · Leito ${a.bed}` : ''}{a.ward ? ` · ${a.ward}` : ''}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
