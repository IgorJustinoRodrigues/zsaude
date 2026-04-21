import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Building2, Search, Palette, Archive, ArchiveRestore, MapPin, Settings } from 'lucide-react'
import { directoryApi, type FacilityDto, type MunicipalityDto } from '../../api/workContext'
import { sysApi } from '../../api/sys'
import { toast } from '../../store/toastStore'
import { HttpError } from '../../api/client'
import { ComboBox, type ComboBoxOption } from '../../components/ui/ComboBox'
import { cn, normalize } from '../../lib/utils'

export function SysFacilityListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [muns, setMuns] = useState<MunicipalityDto[]>([])
  const [facilities, setFacilities] = useState<FacilityDto[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingFacs, setLoadingFacs] = useState(false)
  const [search, setSearch] = useState('')
  const [munId, setMunId] = useState<string | null>(params.get('municipalityId'))
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [toggling, setToggling] = useState<string | null>(null)

  // Carrega diretório (só municípios — unidades vêm por seleção).
  useEffect(() => {
    directoryApi.listMunicipalities()
      .then(setMuns)
      .catch(e => toast.error('Falha ao carregar municípios', e instanceof HttpError ? e.message : ''))
      .finally(() => setLoading(false))
  }, [])

  // Sempre que troca de município, busca as unidades daquele município
  // e sincroniza o query param pra deep-linking.
  useEffect(() => {
    if (!munId) {
      setFacilities([])
      setParams({}, { replace: true })
      return
    }
    setParams({ municipalityId: munId }, { replace: true })
    let cancelled = false
    setLoadingFacs(true)
    directoryApi.listFacilities(munId, undefined, { includeArchived: true })
      .then(r => { if (!cancelled) setFacilities(r) })
      .catch(e => {
        if (!cancelled) toast.error('Falha ao carregar unidades', e instanceof HttpError ? e.message : '')
      })
      .finally(() => { if (!cancelled) setLoadingFacs(false) })
    return () => { cancelled = true }
  }, [munId])  // eslint-disable-line

  const munOptions = useMemo<ComboBoxOption[]>(
    () => muns.map(m => ({ value: m.id, label: m.name, hint: `${m.state} · ${m.ibge}` })),
    [muns],
  )

  const chosenMun = useMemo(() => muns.find(m => m.id === munId) ?? null, [muns, munId])

  const counts = useMemo(() => {
    let active = 0, archived = 0
    for (const f of facilities) {
      if (f.archived) archived++
      else active++
    }
    return { active, archived, all: facilities.length }
  }, [facilities])

  const filtered = useMemo(() => {
    const q = normalize(search)
    return facilities.filter(f => {
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'archived'
            ? !!f.archived
            : !f.archived
      const matchQ =
        !q || [f.name, f.shortName, f.type, f.cnes ?? ''].some(v => normalize(v).includes(q))
      return matchStatus && matchQ
    })
  }, [facilities, search, statusFilter])

  const handleToggleArchive = async (f: FacilityDto) => {
    setToggling(f.id)
    try {
      if (f.archived) {
        await sysApi.unarchiveFacility(f.id)
        toast.success('Unidade ativada', f.shortName || f.name)
      } else {
        await sysApi.archiveFacility(f.id)
        toast.success('Unidade arquivada', f.shortName || f.name)
      }
      setFacilities(prev => prev.map(x => (x.id === f.id ? { ...x, archived: !x.archived } : x)))
    } catch (e) {
      toast.error(
        f.archived ? 'Falha ao ativar' : 'Falha ao arquivar',
        e instanceof HttpError ? e.message : '',
      )
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Unidades</h1>
          <p className="text-sm text-slate-500 mt-1">
            {chosenMun
              ? `${facilities.length} unidade${facilities.length !== 1 ? 's' : ''} em ${chosenMun.name}/${chosenMun.state}`
              : 'Escolha o município para listar as unidades.'}
          </p>
        </div>
        <button
          onClick={() => navigate(munId ? `/sys/unidades/novo?municipalityId=${munId}` : '/sys/unidades/novo')}
          disabled={!munId}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={15} />
          Nova unidade
        </button>
      </div>

      {/* Seleção de município */}
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Município *
        </label>
        <ComboBox
          value={munId}
          onChange={setMunId}
          disabled={loading}
          placeholder={loading ? 'Carregando municípios...' : 'Selecione o município'}
          options={munOptions}
        />
      </div>

      {/* Estado inicial (sem município escolhido) */}
      {!munId && !loading && (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
          <MapPin size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Escolha o município acima para ver as unidades.</p>
        </div>
      )}

      {/* Lista filtrada pelo município */}
      {munId && (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, tipo ou CNES..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {([
                ['active', `Ativas (${counts.active})`],
                ['archived', `Arquivadas (${counts.archived})`],
                ['all', `Todas (${counts.all})`],
              ] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setStatusFilter(v)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                    statusFilter === v
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loadingFacs ? (
            <div className="flex items-center justify-center py-16">
              <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
              <Building2 size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {facilities.length === 0
                  ? 'Nenhuma unidade cadastrada neste município.'
                  : 'Nenhuma unidade combina com o filtro.'}
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(f => (
                <div key={f.id} className={cn(
                  'flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors',
                  f.archived && 'opacity-70',
                )}>
                  <button
                    onClick={() => navigate(`/sys/unidades/${f.id}`)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Building2 size={14} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                        {f.name}
                        {f.archived && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 shrink-0">
                            ARQUIVADA
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {f.shortName} · {f.type}
                        {f.cnes && ` · CNES ${f.cnes}`}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleToggleArchive(f)}
                    disabled={toggling === f.id}
                    title={f.archived ? 'Reativar unidade' : 'Arquivar unidade'}
                    className={cn(
                      'shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50',
                      f.archived
                        ? 'border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400',
                    )}
                  >
                    {f.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                    <span className="hidden md:inline">{f.archived ? 'Ativar' : 'Arquivar'}</span>
                  </button>
                  <button
                    onClick={() => navigate(`/sys/unidades/${f.id}/personalizar`)}
                    title="Personalizar identidade visual"
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                  >
                    <Palette size={12} />
                    <span className="hidden md:inline">Personalizar</span>
                  </button>
                  <button
                    onClick={() => navigate(`/sys/unidades/${f.id}/modulos`)}
                    title="Personalizar módulos da unidade"
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  >
                    <Settings size={12} />
                    <span className="hidden md:inline">Módulos</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
