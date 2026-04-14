import { ShieldCheck } from 'lucide-react'
import { StatsCard } from '../../components/shared/StatsCard'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockInsurances } from '../../mock/insurances'
import { formatDate } from '../../lib/utils'

export function ConvHomePage() {
  const ativos = mockInsurances.filter(i => i.status === 'Ativo').length
  const totalBeneficiarios = mockInsurances.reduce((s, i) => s + i.beneficiariesCount, 0)
  const totalProced = mockInsurances.reduce((s, i) => s + i.proceduresCount, 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Convênios</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestão de planos e convênios de saúde</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatsCard label="Convênios Ativos" value={ativos} icon={<ShieldCheck size={20} />} color="text-emerald-500" />
        <StatsCard label="Beneficiários" value={totalBeneficiarios.toLocaleString('pt-BR')} icon={<ShieldCheck size={20} />} color="text-emerald-600" />
        <StatsCard label="Procedimentos" value={totalProced.toLocaleString('pt-BR')} icon={<ShieldCheck size={20} />} color="text-emerald-400" />
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Convênios Cadastrados</h2>
        </div>
        <div className="divide-y divide-border">
          {mockInsurances.map(ins => (
            <div key={ins.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{ins.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ins.type} · Vigência desde {formatDate(ins.validFrom)}
                  {ins.beneficiariesCount > 0 && ` · ${ins.beneficiariesCount.toLocaleString('pt-BR')} beneficiários`}
                </p>
              </div>
              <StatusBadge status={ins.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
