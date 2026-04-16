import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Search, ChevronLeft, ChevronRight, Camera } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { HttpError } from '../../api/client'
import { hspApi, type PatientListItem } from '../../api/hsp'
import { toast } from '../../store/toastStore'
import { formatCPF, calcAge, initials, cn } from '../../lib/utils'

export function HspPatientListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PatientListItem[]>([])
  const [total, setTotal] = useState(0)

  // Debounce da busca (350ms) + reset de página no mesmo ciclo.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [activeFilter])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hspApi.list({
        search: debounced || undefined,
        active: activeFilter,
        page,
        pageSize,
        sort: 'name',
        dir: 'asc',
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [debounced, activeFilter, page])

  useEffect(() => { void reload() }, [reload])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <PageHeader
        title="Pacientes"
        subtitle={`${total} paciente${total !== 1 ? 's' : ''}`}
        actions={
          <button
            onClick={() => navigate('/hsp/pacientes/novo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus size={16} /> Novo paciente
          </button>
        }
      />

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, CPF, CNS ou prontuário..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <select
            value={activeFilter === undefined ? '' : activeFilter ? 'ativo' : 'inativo'}
            onChange={e => {
              const v = e.target.value
              setActiveFilter(v === '' ? undefined : v === 'ativo')
            }}
            className="text-sm border border-border rounded-lg bg-background px-3 py-2"
          >
            <option value="">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prontuário</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Paciente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Idade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sexo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Carregando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum paciente encontrado.</td></tr>
              ) : items.map(p => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/hsp/pacientes/${p.id}`)}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/30"
                >
                  <td className="px-4 py-3"><span className="font-mono text-xs text-muted-foreground">{p.prontuario}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold relative shrink-0">
                        {p.hasPhoto ? (
                          <>
                            <Camera size={12} />
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-white" />
                          </>
                        ) : initials(p.name)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{p.socialName || p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.cpf ? formatCPF(p.cpf) : '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.birthDate ? `${calcAge(p.birthDate)} anos` : '—'}</td>
                  <td className="px-4 py-3">{p.sex === 'F' ? 'Feminino' : p.sex === 'M' ? 'Masculino' : p.sex === 'I' ? 'Intersexo' : '—'}</td>
                  <td className="px-4 py-3">{p.cellphone || p.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
                    )}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages} — {total} registros
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded border border-border disabled:opacity-40 hover:bg-muted/60"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded border border-border disabled:opacity-40 hover:bg-muted/60"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
