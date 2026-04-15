import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Shield, Search, Archive, ArchiveRestore, Users } from 'lucide-react'
import { rolesAdminApi, type RoleScope, type RoleSummary } from '../../api/roles'
import { sysApi, type MunicipalityAdminDetail } from '../../api/sys'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn, normalize } from '../../lib/utils'

export function SysRoleListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<RoleSummary[]>([])
  const [municipalities, setMunicipalities] = useState<MunicipalityAdminDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'ALL' | RoleScope>('ALL')
  const [municipalityFilter, setMunicipalityFilter] = useState<string>('ALL')
  const [includeArchived, setIncludeArchived] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    const munId = municipalityFilter === 'ALL' ? undefined : municipalityFilter
    const scope = scopeFilter === 'ALL' ? undefined : scopeFilter
    rolesAdminApi
      .list({ municipalityId: munId, scope, includeArchived })
      .then(setItems)
      .catch(e => setError(e instanceof HttpError ? e.message : 'Erro ao carregar perfis.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [scopeFilter, municipalityFilter, includeArchived]) // eslint-disable-line

  useEffect(() => {
    sysApi.listMunicipalities(false).then(setMunicipalities).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = normalize(search)
    if (!q) return items
    return items.filter(r =>
      [r.code, r.name, r.description ?? ''].some(v => normalize(v).includes(q)),
    )
  }, [items, search])

  const munName = (id: string | null) => {
    if (!id) return '—'
    const m = municipalities.find(x => x.id === id)
    return m ? `${m.name}/${m.state}` : '—'
  }

  const toggleArchive = async (r: RoleSummary) => {
    setActing(r.id)
    try {
      if (r.archived) {
        await rolesAdminApi.unarchive(r.id)
        toast.success('Perfil reativado', r.name)
      } else {
        await rolesAdminApi.archive(r.id)
        toast.success('Perfil arquivado', r.name)
      }
      load()
    } catch (e) {
      toast.error('Falha', e instanceof HttpError ? e.message : 'Tente novamente.')
    } finally { setActing(null) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Perfis</h1>
          <p className="text-sm text-slate-500 mt-1">
            {items.length} perfil{items.length === 1 ? '' : 's'}
            {scopeFilter !== 'ALL' && <span className="ml-1">— escopo <strong>{scopeFilter}</strong></span>}
          </p>
        </div>
        <button
          onClick={() => navigate('/sys/perfis/novo')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shrink-0"
        >
          <Plus size={16} /> Novo perfil
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-border p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar perfil..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
          />
        </div>
        <select
          value={scopeFilter}
          onChange={e => setScopeFilter(e.target.value as 'ALL' | RoleScope)}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
        >
          <option value="ALL">Todos os escopos</option>
          <option value="SYSTEM">SYSTEM (plataforma)</option>
          <option value="MUNICIPALITY">MUNICIPALITY (município)</option>
        </select>
        <select
          value={municipalityFilter}
          onChange={e => setMunicipalityFilter(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
        >
          <option value="ALL">Todos os municípios</option>
          {municipalities.map(m => (
            <option key={m.id} value={m.id}>{m.name}/{m.state}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer whitespace-nowrap sm:col-span-2 lg:col-span-1">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={e => setIncludeArchived(e.target.checked)}
          />
          Incluir arquivados
        </label>
      </div>

      {loading && <div className="text-center py-10 text-muted-foreground">Carregando…</div>}
      {error && <div className="text-center py-10 text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum perfil encontrado.</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(r => (
                <div
                  key={r.id}
                  className={cn(
                    'flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer',
                    r.archived && 'opacity-60',
                  )}
                  onClick={() => navigate(`/sys/perfis/${r.id}`)}
                >
                  <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                    <Shield size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{r.name}</p>
                      <span className="text-[11px] font-mono text-muted-foreground">{r.code}</span>
                      {r.isSystemBase && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                          base
                        </span>
                      )}
                      {r.archived && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                          arquivado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.description ?? 'Sem descrição.'}
                    </p>
                  </div>
                  <div className="hidden md:flex flex-col items-end gap-1 text-xs text-muted-foreground shrink-0">
                    <span className={cn(
                      'px-2 py-0.5 rounded font-medium',
                      r.scope === 'SYSTEM'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-emerald-50 text-emerald-700',
                    )}>
                      {r.scope}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {munName(r.municipalityId)}
                    </span>
                  </div>
                  <button
                    disabled={r.isSystemBase || acting === r.id}
                    onClick={e => { e.stopPropagation(); toggleArchive(r) }}
                    className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={r.isSystemBase ? 'Perfil base — não pode ser arquivado' : r.archived ? 'Reativar' : 'Arquivar'}
                  >
                    {r.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
