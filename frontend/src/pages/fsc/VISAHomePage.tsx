import { ClipboardCheck, AlertTriangle } from 'lucide-react'
import { StatsCard } from '../../components/shared/StatsCard'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockEstablishments } from '../../mock/establishments'
import { formatDate } from '../../lib/utils'
import { useNavigate } from 'react-router-dom'

export function VISAHomePage() {
  const regular = mockEstablishments.filter(e => e.status === 'Regular').length
  const irregular = mockEstablishments.filter(e => e.status === 'Irregular').length
  const vencidos = mockEstablishments.filter(e => e.licenseStatus === 'Vencido').length
  const navigate = useNavigate()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Vigilância Sanitária</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Fiscalização e controle sanitário de estabelecimentos</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatsCard label="Estabelecimentos Regulares" value={regular} icon={<ClipboardCheck size={20} />} color="text-emerald-500" />
        <StatsCard label="Irregulares" value={irregular} icon={<AlertTriangle size={20} />} color="text-red-400" />
        <StatsCard label="Alvarás Vencidos" value={vencidos} icon={<AlertTriangle size={20} />} color="text-amber-500" />
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Estabelecimentos</h2>
          <a href="/fsc/estabelecimentos" className="text-xs text-primary hover:underline">Ver todos</a>
        </div>
        <div className="divide-y divide-border">
          {mockEstablishments.map(est => (
            <div
              key={est.id}
              onClick={() => navigate('/fsc/estabelecimentos')}
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{est.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {est.type} · {est.address.neighborhood} · Alvará vence: {formatDate(est.licenseExpiry)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={est.licenseStatus} />
                <StatusBadge status={est.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
