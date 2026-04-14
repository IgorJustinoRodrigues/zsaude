import { useParams } from 'react-router-dom'
import {
  Stethoscope, FlaskConical, BedDouble, ShieldCheck, ClipboardCheck, Truck,
} from 'lucide-react'
import type { SystemId } from '../types'

const MODULE_INFO: Record<SystemId, { label: string; abbrev: string; description: string; icon: React.ReactNode; color: string }> = {
  ga:   { label: 'Clínica',     abbrev: 'CLN', description: 'Atendimento ambulatorial, pacientes, prontuário eletrônico, fila de atendimento, APAC, produção e estoque.', icon: <Stethoscope size={32} />, color: '#0ea5e9' },
  lab:  { label: 'Diagnóstico', abbrev: 'DGN', description: 'Pedidos de exame, coleta, análise e liberação de laudos laboratoriais.',                                      icon: <FlaskConical size={32} />, color: '#8b5cf6' },
  aih:  { label: 'Hospitalar',  abbrev: 'HSP', description: 'Autorização e gestão de internações hospitalares, leitos e documentação.',                                     icon: <BedDouble size={32} />,    color: '#f59e0b' },
  conv: { label: 'Planos',      abbrev: 'PLN', description: 'Convênios, coberturas, planos de saúde, IPASGO e procedimentos cobertos.',                                     icon: <ShieldCheck size={32} />,  color: '#10b981' },
  visa: { label: 'Fiscal',      abbrev: 'FSC', description: 'Vigilância sanitária, alvarás, inspeções e controle de estabelecimentos.',                                     icon: <ClipboardCheck size={32} />, color: '#f97316' },
  adm:  { label: 'Operações',   abbrev: 'OPS', description: 'Frota, motoristas, transporte de pacientes e logística de saúde.',                                             icon: <Truck size={32} />,        color: '#6b7280' },
}

export function ModulePlaceholder() {
  const { module } = useParams<{ module: string }>()
  const info = module ? MODULE_INFO[module as SystemId] : null

  if (!info) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-sm text-slate-400">Módulo não encontrado.</p>
    </div>
  )

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-sm">
        {/* Icon */}
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ backgroundColor: info.color + '15', color: info.color }}
        >
          {info.icon}
        </div>

        {/* Abbrev + Name */}
        <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: info.color }}>
          {info.abbrev}
        </p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{info.label}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">{info.description}</p>

        {/* Status pill */}
        <div className="mt-8 flex items-center justify-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium border"
            style={{ borderColor: info.color + '40', color: info.color, backgroundColor: info.color + '08' }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: info.color }} />
            Em desenvolvimento
          </div>
        </div>
      </div>
    </div>
  )
}
