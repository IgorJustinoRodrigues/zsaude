import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart2, KeySquare, Search, ArrowRight,
  Users, ScrollText, ShieldAlert, FileBarChart, Activity,
} from 'lucide-react'
import { normalize } from '../../lib/utils'

interface Report {
  id: string
  title: string
  description: string
  longDescription: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  category: string
  path: string
  tags: string[]
}

const REPORTS: Report[] = [
  {
    id: 'acessos',
    title: 'Relatório de Acessos',
    description: 'Histórico de logins por usuário com datas, IPs e tentativas falhas.',
    longDescription:
      'Consolida os registros de login, logout e tentativas de acesso malsucedidas por usuário, com linha do tempo detalhada, endereços IP e totalizadores por período.',
    icon: <KeySquare size={22} />,
    iconBg: 'bg-sky-50 dark:bg-sky-950/50',
    iconColor: 'text-sky-500',
    category: 'Segurança',
    path: '/ops/relatorios/acessos',
    tags: ['login', 'acesso', 'segurança', 'ip', 'senha'],
  },
  {
    id: 'usuarios',
    title: 'Relatório de Usuários',
    description: 'Listagem completa de usuários com status, perfis e municípios de acesso.',
    longDescription:
      'Exibe todos os usuários cadastrados no sistema com seus respectivos perfis, situação (ativo/inativo/bloqueado) e municípios vinculados, podendo ser filtrado por período de cadastro.',
    icon: <Users size={22} />,
    iconBg: 'bg-violet-50 dark:bg-violet-950/50',
    iconColor: 'text-violet-500',
    category: 'Cadastros',
    path: '/ops/relatorios/usuarios',
    tags: ['usuario', 'perfil', 'status', 'municipio', 'cadastro'],
  },
  {
    id: 'auditoria',
    title: 'Relatório de Auditoria',
    description: 'Trilha de auditoria com todas as ações realizadas no sistema.',
    longDescription:
      'Apresenta a trilha completa de auditoria com criações, edições, exclusões e exportações realizadas por cada usuário, filtrável por módulo, ação e período.',
    icon: <ScrollText size={22} />,
    iconBg: 'bg-amber-50 dark:bg-amber-950/50',
    iconColor: 'text-amber-500',
    category: 'Segurança',
    path: '/ops/relatorios/auditoria',
    tags: ['auditoria', 'log', 'acao', 'historico', 'trilha'],
  },
  {
    id: 'ocorrencias',
    title: 'Relatório de Ocorrências',
    description: 'Erros, alertas e eventos críticos agrupados por severidade.',
    longDescription:
      'Agrupa os eventos de aviso, erro e críticos registrados nos logs do sistema, permitindo identificar padrões de falha e frequência de incidentes por módulo e período.',
    icon: <ShieldAlert size={22} />,
    iconBg: 'bg-red-50 dark:bg-red-950/50',
    iconColor: 'text-red-500',
    category: 'Segurança',
    path: '/ops/relatorios/ocorrencias',
    tags: ['erro', 'critico', 'alerta', 'ocorrencia', 'incidente', 'falha'],
  },
  {
    id: 'producao',
    title: 'Relatório de Produção',
    description: 'Atendimentos realizados por profissional, especialidade e período.',
    longDescription:
      'Consolida a produção de atendimentos clínicos por profissional e especialidade, com métricas de conclusão, ausências e tempo médio de espera.',
    icon: <FileBarChart size={22} />,
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    iconColor: 'text-emerald-500',
    category: 'Clínico',
    path: '/ops/relatorios/producao',
    tags: ['producao', 'atendimento', 'profissional', 'especialidade', 'clinico'],
  },
  {
    id: 'atividade',
    title: 'Relatório de Atividade',
    description: 'Resumo de uso do sistema por módulo, horário e volume de ações.',
    longDescription:
      'Mostra o volume de ações por módulo e horário do dia, ajudando a identificar os períodos de maior uso e os recursos mais acessados pelos usuários.',
    icon: <Activity size={22} />,
    iconBg: 'bg-indigo-50 dark:bg-indigo-950/50',
    iconColor: 'text-indigo-500',
    category: 'Operacional',
    path: '/ops/relatorios/atividade',
    tags: ['atividade', 'uso', 'modulo', 'horario', 'volume'],
  },
]

const CATEGORIES = ['Todos', ...Array.from(new Set(REPORTS.map(r => r.category)))]

export function OpsReportsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')

  const filtered = useMemo(() => {
    const q = normalize(search)
    return REPORTS.filter(r => {
      const matchCat = activeCategory === 'Todos' || r.category === activeCategory
      const matchSearch =
        !q ||
        normalize(r.title).includes(q) ||
        normalize(r.description).includes(q) ||
        normalize(r.longDescription).includes(q) ||
        r.tags.some(t => normalize(t).includes(q))
      return matchCat && matchSearch
    })
  }, [search, activeCategory])

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              <BarChart2 size={16} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Relatórios</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {REPORTS.length} relatórios disponíveis · selecione um para visualizar
          </p>
        </div>
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar relatório..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
          />
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
            <Search size={24} />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Nenhum relatório encontrado</p>
          <p className="text-xs text-slate-400">Tente outros termos ou limpe os filtros.</p>
          <button
            onClick={() => { setSearch(''); setActiveCategory('Todos') }}
            className="mt-2 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(report => (
            <ReportCard key={report.id} report={report} onOpen={() => navigate(report.path)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReportCard({ report, onOpen }: { report: Report; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md dark:hover:shadow-slate-900/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
    >
      {/* Icon + category */}
      <div className="flex items-start justify-between gap-3">
        <div className={`p-2.5 rounded-xl ${report.iconBg} ${report.iconColor}`}>
          {report.icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
          {report.category}
        </span>
      </div>

      {/* Title + description */}
      <div className="flex-1 space-y-1.5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
          {report.title}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {report.longDescription}
        </p>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
        <span>Abrir relatório</span>
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}
