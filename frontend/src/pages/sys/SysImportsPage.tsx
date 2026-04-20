// Hub de importações globais (MASTER only).

import { useNavigate } from 'react-router-dom'
import { ArrowRight, Upload, FileStack, Stethoscope } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'

interface Importer {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  path: string
  tag: string
}

const IMPORTERS: Importer[] = [
  {
    id: 'sigtap',
    title: 'SIGTAP — Tabela Unificada',
    description:
      'Atualiza o catálogo nacional de procedimentos SUS (procedimentos, CIDs, CBOs, modalidades, serviços, habilitações) a partir do pacote ZIP do DATASUS.',
    icon: <FileStack size={22} />,
    iconBg: 'bg-violet-50 dark:bg-violet-950/50',
    iconColor: 'text-violet-500',
    path: '/sys/importacoes/sigtap',
    tag: 'TERMINOLOGIAS',
  },
  {
    id: 'cnes',
    title: 'CNES — Cadastro de Estabelecimentos',
    description:
      'Sobe o pacote TXTPROC do DATASUS pra qualquer município cadastrado. Importa unidades, profissionais, vínculos, leitos, equipes e habilitações no schema do município escolhido.',
    icon: <Stethoscope size={22} />,
    iconBg: 'bg-sky-50 dark:bg-sky-950/50',
    iconColor: 'text-sky-500',
    path: '/sys/importacoes/cnes',
    tag: 'MUNICÍPIO',
  },
]

export function SysImportsPage() {
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Importações"
        subtitle={`${IMPORTERS.length} importação disponível · escopo global (plataforma)`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {IMPORTERS.map(imp => (
          <button
            key={imp.id}
            onClick={() => navigate(imp.path)}
            className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`p-2.5 rounded-xl ${imp.iconBg} ${imp.iconColor}`}>
                {imp.icon}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-1">
                {imp.tag}
              </span>
            </div>
            <div className="flex-1 space-y-1.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {imp.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {imp.description}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
              <Upload size={13} />
              <span>Abrir importação</span>
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
