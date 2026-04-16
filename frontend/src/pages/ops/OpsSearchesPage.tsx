import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, ArrowRight, SearchCheck,
  Briefcase, Stethoscope, ClipboardList, ServerCog, Award, Link2, FolderTree,
} from 'lucide-react'
import { normalize } from '../../lib/utils'

interface SearchItem {
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

const SEARCHES: SearchItem[] = [
  {
    id: 'procedimentos',
    title: 'Procedimentos SIGTAP',
    description: 'Catálogo nacional de procedimentos SUS.',
    longDescription:
      'Consulta completa da tabela SIGTAP com código, descrição, complexidade, valores (SH/SA/SP), financiamento e detalhes de cada procedimento.',
    icon: <ClipboardList size={22} />,
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    iconColor: 'text-emerald-500',
    category: 'Tabela',
    path: '/ops/pesquisas/procedimentos',
    tags: ['procedimento', 'sigtap', 'opm', 'ambulatorial', 'hospitalar', 'tabela', 'valor'],
  },
  {
    id: 'cbo',
    title: 'CBO × Procedimentos',
    description: 'Ocupações e seus procedimentos habilitados.',
    longDescription:
      'Pesquise uma ocupação profissional (CBO) e veja quais procedimentos SIGTAP ela está habilitada a executar conforme as regras ministeriais vigentes.',
    icon: <Briefcase size={22} />,
    iconBg: 'bg-sky-50 dark:bg-sky-950/50',
    iconColor: 'text-sky-500',
    category: 'Cruzamento',
    path: '/ops/pesquisas/cbo',
    tags: ['cbo', 'ocupacao', 'profissional', 'procedimento', 'habilitacao'],
  },
  {
    id: 'cid',
    title: 'CID × Procedimentos',
    description: 'Diagnósticos e seus procedimentos compatíveis.',
    longDescription:
      'Pesquise um diagnóstico (CID-10) e veja quais procedimentos SIGTAP são compatíveis — útil para validar autorizações de atendimento.',
    icon: <Stethoscope size={22} />,
    iconBg: 'bg-amber-50 dark:bg-amber-950/50',
    iconColor: 'text-amber-500',
    category: 'Cruzamento',
    path: '/ops/pesquisas/cid',
    tags: ['cid', 'doenca', 'diagnostico', 'procedimento', 'autorizacao', 'compatibilidade'],
  },
  {
    id: 'servicos',
    title: 'Serviços × Procedimentos',
    description: 'Serviços de saúde e procedimentos disponíveis.',
    longDescription:
      'Pesquise um serviço e sua classificação para ver quais procedimentos podem ser realizados — essencial para faturamento.',
    icon: <ServerCog size={22} />,
    iconBg: 'bg-teal-50 dark:bg-teal-950/50',
    iconColor: 'text-teal-500',
    category: 'Cruzamento',
    path: '/ops/pesquisas/servicos',
    tags: ['servico', 'classificacao', 'faturamento', 'procedimento'],
  },
  {
    id: 'habilitacoes',
    title: 'Habilitações × Procedimentos',
    description: 'Habilitações SIGTAP e o que permitem faturar.',
    longDescription:
      'Pesquise uma habilitação e veja quais procedimentos ela autoriza — útil para validar o que a unidade pode faturar.',
    icon: <Award size={22} />,
    iconBg: 'bg-indigo-50 dark:bg-indigo-950/50',
    iconColor: 'text-indigo-500',
    category: 'Cruzamento',
    path: '/ops/pesquisas/habilitacoes',
    tags: ['habilitacao', 'faturamento', 'procedimento', 'autorizacao'],
  },
  {
    id: 'compatibilidades',
    title: 'Compatibilidades',
    description: 'Procedimentos que podem ser cobrados juntos.',
    longDescription:
      'Pesquise um procedimento e veja com quais outros ele é compatível — crítico para autorização AIH/APAC e regras do SUS.',
    icon: <Link2 size={22} />,
    iconBg: 'bg-orange-50 dark:bg-orange-950/50',
    iconColor: 'text-orange-500',
    category: 'Cruzamento',
    path: '/ops/pesquisas/compatibilidades',
    tags: ['compatibilidade', 'aih', 'apac', 'autorizacao', 'procedimento'],
  },
  {
    id: 'formas-organizacao',
    title: 'Formas de Organização',
    description: 'Estrutura Grupo / Subgrupo / Forma da SIGTAP.',
    longDescription:
      'Consulta da hierarquia de organização dos procedimentos SIGTAP — grupo, subgrupo e forma de organização.',
    icon: <FolderTree size={22} />,
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconColor: 'text-slate-500',
    category: 'Tabela',
    path: '/ops/pesquisas/formas-organizacao',
    tags: ['forma', 'organizacao', 'grupo', 'subgrupo', 'hierarquia'],
  },
]

const CATEGORIES = ['Todos', ...Array.from(new Set(SEARCHES.map(r => r.category)))]

export function OpsSearchesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')

  const filtered = useMemo(() => {
    const q = normalize(search)
    return SEARCHES.filter(r => {
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
              <SearchCheck size={16} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pesquisas</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Consulte procedimentos, ocupações e diagnósticos do SIGTAP
          </p>
        </div>
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar pesquisa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
          />
        </div>

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

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
            <Search size={24} />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Nenhuma pesquisa encontrada</p>
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
          {filtered.map(item => (
            <SearchCard key={item.id} item={item} onOpen={() => navigate(item.path)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SearchCard({ item, onOpen }: { item: SearchItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md dark:hover:shadow-slate-900/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`p-2.5 rounded-xl ${item.iconBg} ${item.iconColor}`}>
          {item.icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
          {item.category}
        </span>
      </div>

      <div className="flex-1 space-y-1.5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
          {item.title}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {item.longDescription}
        </p>
      </div>

      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
        <span>Abrir pesquisa</span>
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}
