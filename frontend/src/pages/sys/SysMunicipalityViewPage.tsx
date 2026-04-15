import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, MapPin, Building2, Plus, Archive, ArchiveRestore, Users, Home,
} from 'lucide-react'
import { sysApi, type MunicipalityAdminDetail, type FacilityAdmin } from '../../api/sys'
import { directoryApi } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { LocationMap, type MapLayer } from '../../components/shared/LocationMap'

export function SysMunicipalityViewPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [mun, setMun] = useState<MunicipalityAdminDetail | null>(null)
  const [facilities, setFacilities] = useState<FacilityAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const m = await sysApi.getMunicipality(id)
      setMun(m)
      const facs = await directoryApi.listFacilities(id)
      setFacilities(facs as FacilityAdmin[])
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao carregar.'
      setError(msg)
      toast.error('Falha ao carregar município', msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id]) // eslint-disable-line

  const toggleArchive = async () => {
    if (!mun) return
    setActing(true)
    try {
      if (mun.archived) {
        await sysApi.unarchiveMunicipality(mun.id)
        toast.success('Município reativado', mun.name)
      } else {
        await sysApi.archiveMunicipality(mun.id)
        toast.success('Município arquivado', mun.name)
      }
      await load()
    } catch (e) {
      toast.error(
        'Falha ao atualizar',
        e instanceof HttpError ? e.message : 'Tente novamente.',
      )
    } finally { setActing(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    )
  }
  if (!mun) {
    return <p className="text-sm text-slate-500 py-12 text-center">{error || 'Município não encontrado.'}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/sys/municipios')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin size={20} className="text-violet-500" />
              {mun.name}
              {mun.archived && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 uppercase tracking-widest">Arquivado</span>}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {mun.state} · IBGE {mun.ibge} · schema <span className="font-mono text-violet-600 dark:text-violet-400">{mun.schemaName}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleArchive} disabled={acting}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50',
              mun.archived
                ? 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-red-400 hover:text-red-500'
            )}>
            {mun.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {mun.archived ? 'Reativar' : 'Arquivar'}
          </button>
          <button onClick={() => navigate(`/sys/municipios/${mun.id}/editar`)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
            <Pencil size={14} />
            Editar
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Unidades" value={mun.facilityCount} />
        <SummaryCard label="Usuários vinculados" value={mun.userCount} />
        <SummaryCard label="População" value={mun.population != null ? mun.population.toLocaleString('pt-BR') : '—'} />
        <SummaryCard label="Bairros" value={mun.neighborhoods.length} />
      </div>

      {/* Mapa */}
      {(mun.centerLatitude != null || mun.territory || mun.neighborhoods.some(h => h.latitude != null || h.territory)) && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
            <MapPin size={14} className="text-violet-500" />
            <h2 className="text-sm font-semibold">Território</h2>
          </div>
          <LocationMap
            fallbackCenter={[-15.78, -47.92, 5]}
            point={
              mun.centerLatitude != null && mun.centerLongitude != null
                ? [Number(mun.centerLatitude), Number(mun.centerLongitude)]
                : null
            }
            polygon={mun.territory}
            extraLayers={mun.neighborhoods.flatMap<MapLayer>(h => {
              const layer: MapLayer = { label: h.name, color: '#0ea5e9' }
              if (h.latitude != null && h.longitude != null) {
                layer.point = [Number(h.latitude), Number(h.longitude)]
              }
              if (h.territory) layer.polygon = h.territory
              return (layer.point || layer.polygon) ? [layer] : []
            })}
            mode="idle"
            onPointChange={() => {}}
            onPolygonChange={() => {}}
            height="360px"
          />
        </div>
      )}

      {/* Bairros */}
      {mun.neighborhoods.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
            <Home size={14} className="text-sky-500" />
            <h2 className="text-sm font-semibold">Bairros ({mun.neighborhoods.length})</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {mun.neighborhoods.map(h => (
              <div key={h.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950/40 text-sky-600 flex items-center justify-center shrink-0">
                  <Home size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{h.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {h.population != null && <span className="inline-flex items-center gap-1"><Users size={10} /> {h.population.toLocaleString('pt-BR')} hab</span>}
                    {h.population != null && (h.latitude != null || h.territory) && ' · '}
                    {h.latitude != null && '📍 ponto'}
                    {h.latitude != null && h.territory && ' · '}
                    {h.territory && '🗺 território'}
                    {h.population == null && h.latitude == null && !h.territory && '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unidades */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Building2 size={14} /> Unidades ({facilities.length})
          </h2>
          <button onClick={() => navigate(`/sys/unidades/novo?municipalityId=${mun.id}`)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors">
            <Plus size={12} />
            Nova unidade
          </button>
        </div>
        {facilities.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">Nenhuma unidade cadastrada.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {facilities.map(f => (
              <button key={f.id} onClick={() => navigate(`/sys/unidades/${f.id}`)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left">
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Building2 size={13} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{f.name}</p>
                  <p className="text-[11px] text-slate-400">{f.shortName} · {f.type}{f.cnes ? ` · CNES ${f.cnes}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{label}</p>
    </div>
  )
}
