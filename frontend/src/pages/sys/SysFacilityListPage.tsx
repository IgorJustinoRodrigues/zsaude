import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, Search, Palette } from 'lucide-react'
import { directoryApi, type FacilityDto, type MunicipalityDto } from '../../api/workContext'
import { toast } from '../../store/toastStore'
import { HttpError } from '../../api/client'
import { normalize, cn } from '../../lib/utils'

export function SysFacilityListPage() {
  const navigate = useNavigate()
  const [muns, setMuns] = useState<MunicipalityDto[]>([])
  const [facilities, setFacilities] = useState<FacilityDto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mFilter, setMFilter] = useState<string>('Todos')

  useEffect(() => {
    Promise.all([directoryApi.listMunicipalities(), directoryApi.listFacilities()])
      .then(([m, f]) => { setMuns(m); setFacilities(f) })
      .catch(e => toast.error(
        'Falha ao carregar unidades',
        e instanceof HttpError ? e.message : 'Tente novamente.',
      ))
      .finally(() => setLoading(false))
  }, [])

  const munById = useMemo(() => {
    const map: Record<string, MunicipalityDto> = {}
    muns.forEach(m => { map[m.id] = m })
    return map
  }, [muns])

  const filtered = facilities.filter(f => {
    const q = normalize(search)
    const matchMun = mFilter === 'Todos' || f.municipalityId === mFilter
    const matchQ = !q || [f.name, f.shortName, f.type, munById[f.municipalityId]?.name ?? ''].some(v => normalize(v).includes(q))
    return matchMun && matchQ
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Unidades</h1>
          <p className="text-sm text-slate-500 mt-1">{facilities.length} unidades em {muns.length} município{muns.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate('/sys/unidades/novo')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shrink-0">
          <Plus size={15} />
          Nova unidade
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, tipo ou município..."
            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200" />
        </div>
        <select value={mFilter} onChange={e => setMFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200">
          <option value="Todos">Todos os municípios</option>
          {muns.map(m => <option key={m.id} value={m.id}>{m.name} – {m.state}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
          <Building2 size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma unidade encontrada.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
              <button
                onClick={() => navigate(`/sys/unidades/${f.id}`)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Building2 size={14} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{f.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {f.shortName} · {f.type}
                    {f.cnes && ` · CNES ${f.cnes}`}
                  </p>
                </div>
                <div className="shrink-0 text-right hidden sm:block">
                  <p className="text-xs text-slate-500">{munById[f.municipalityId]?.name ?? '—'}</p>
                  <p className="text-[11px] text-slate-400">{munById[f.municipalityId]?.state}</p>
                </div>
              </button>
              <button
                onClick={() => navigate(`/sys/unidades/${f.id}/personalizar`)}
                title="Personalizar identidade visual"
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              >
                <Palette size={12} />
                <span className="hidden md:inline">Personalizar</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
