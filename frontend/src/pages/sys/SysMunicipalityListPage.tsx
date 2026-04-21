import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MapPin, Search, Archive, ArchiveRestore, Palette, Settings, LayoutList } from 'lucide-react'
import { sysApi, type MunicipalityAdminDetail } from '../../api/sys'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { normalize, cn } from '../../lib/utils'

export function SysMunicipalityListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<MunicipalityAdminDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    sysApi.listMunicipalities(includeArchived)
      .then(setItems)
      .catch(e => setError(e instanceof HttpError ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [includeArchived]) // eslint-disable-line

  const filtered = items.filter(m => {
    const q = normalize(search)
    return !q || [m.name, m.state, m.ibge].some(v => normalize(v).includes(q))
  })

  const toggleArchive = async (m: MunicipalityAdminDetail) => {
    setActing(m.id)
    try {
      if (m.archived) {
        await sysApi.unarchiveMunicipality(m.id)
        toast.success('Município reativado', m.name)
      } else {
        await sysApi.archiveMunicipality(m.id)
        toast.success('Município arquivado', `${m.name} foi arquivado.`)
      }
      load()
    } catch (e) {
      toast.error(
        'Falha ao atualizar município',
        e instanceof HttpError ? e.message : 'Tente novamente.',
      )
    } finally { setActing(null) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Municípios</h1>
          <p className="text-sm text-slate-500 mt-1">{items.length} municípios {includeArchived ? '(incluindo arquivados)' : 'ativos'}</p>
        </div>
        <button onClick={() => navigate('/sys/municipios/novo')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shrink-0">
          <Plus size={15} />
          Novo município
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" placeholder="Buscar por nome, UF ou IBGE..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3">
          <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />
          Incluir arquivados
        </label>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
          <MapPin size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum município encontrado.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(m => (
            <div key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
              <button onClick={() => navigate(`/sys/municipios/${m.id}`)}
                className="flex items-center gap-3 flex-1 text-left min-w-0">
                <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-500 flex items-center justify-center shrink-0">
                  <MapPin size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {m.name}
                    <span className="text-[10px] font-bold text-slate-400">{m.state}</span>
                    {m.archived && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 uppercase tracking-widest">Arquivado</span>}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    IBGE {m.ibge} · schema {m.schemaName}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-500">{m.facilityCount} unidade{m.facilityCount !== 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-slate-400">{m.userCount} usuário{m.userCount !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={() => navigate(`/sys/municipios/${m.id}/personalizar`)}
                  title="Personalizar identidade visual"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                  <Palette size={12} />
                  <span className="hidden md:inline">Personalizar</span>
                </button>
                <button
                  onClick={() => navigate(`/sys/municipios/${m.id}/recursos`)}
                  title="Recursos do município (setores, etc)"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                  <LayoutList size={12} />
                  <span className="hidden md:inline">Recursos</span>
                </button>
                <button
                  onClick={() => navigate(`/sys/municipios/${m.id}/modulos`)}
                  title="Personalizar módulos do município"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                >
                  <Settings size={12} />
                  <span className="hidden md:inline">Módulos</span>
                </button>
                <button
                  onClick={() => toggleArchive(m)}
                  disabled={acting === m.id}
                  className={cn(
                    'p-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50',
                    m.archived
                      ? 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                  title={m.archived ? 'Reativar' : 'Arquivar'}
                >
                  {m.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
