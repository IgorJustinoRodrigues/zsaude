import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Shield, Search, Archive, ArchiveRestore } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { rolesApi, type RoleSummary } from '../../api/roles'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
import { cn, normalize } from '../../lib/utils'

export function RoleListPage() {
  const navigate = useNavigate()
  const can = useAuthStore(s => s.can)
  const ctx = useAuthStore(s => s.context)
  const canCreate = can('roles.role.create')
  const canArchive = can('roles.role.archive')

  const [items, setItems] = useState<RoleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    rolesApi.list({ includeArchived })
      .then(setItems)
      .catch(e => setError(e instanceof HttpError ? e.message : 'Erro ao carregar perfis.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [includeArchived]) // eslint-disable-line

  const filtered = useMemo(() => {
    const q = normalize(search)
    if (!q) return items
    return items.filter(r =>
      [r.code, r.name, r.description ?? ''].some(v => normalize(v).includes(q)),
    )
  }, [items, search])

  const toggleArchive = async (r: RoleSummary) => {
    setActing(r.id)
    try {
      if (r.archived) {
        await rolesApi.unarchive(r.id)
        toast.success('Perfil reativado', r.name)
      } else {
        await rolesApi.archive(r.id)
        toast.success('Perfil arquivado', r.name)
      }
      load()
    } catch (e) {
      toast.error('Falha', e instanceof HttpError ? e.message : 'Tente novamente.')
    } finally { setActing(null) }
  }

  return (
    <div>
      <PageHeader
        title="Perfis"
        subtitle={`${ctx?.municipality.name ?? ''} — ${items.length} perfil${items.length === 1 ? '' : 's'} disponível${items.length === 1 ? '' : 'eis'}`}
        actions={
          canCreate && (
            <button
              onClick={() => navigate('/shared/perfis/novo')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
            >
              <Plus size={16} /> Novo perfil
            </button>
          )
        }
      />

      <div className="bg-white rounded-xl border border-border p-4 flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar perfil..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />
          Incluir arquivados
        </label>
      </div>

      {loading && <div className="text-center py-10 text-muted-foreground">Carregando…</div>}
      {error && <div className="text-center py-10 text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum perfil.</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(r => (
                <div
                  key={r.id}
                  className={cn(
                    'flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer',
                    r.archived && 'opacity-60',
                  )}
                  onClick={() => navigate(`/shared/perfis/${r.id}`)}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Shield size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{r.name}</p>
                      <span className="text-[11px] font-mono text-muted-foreground">{r.code}</span>
                      <span className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded font-medium',
                        r.scope === 'SYSTEM' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700',
                      )}>
                        {r.scope === 'SYSTEM' ? 'herdado' : 'local'}
                      </span>
                      {r.archived && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">arquivado</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.description ?? 'Sem descrição.'}
                    </p>
                  </div>
                  {canArchive && r.scope === 'MUNICIPALITY' && (
                    <button
                      disabled={acting === r.id}
                      onClick={e => { e.stopPropagation(); toggleArchive(r) }}
                      className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                      title={r.archived ? 'Reativar' : 'Arquivar'}
                    >
                      {r.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
