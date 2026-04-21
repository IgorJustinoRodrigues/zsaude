// Cadastros de referência globais (MASTER).

import { useCallback, useEffect, useState } from 'react'
import {
  Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown,
  Plus, Pencil, Trash2, Lock, Flag, Users, Leaf, MapPin, CheckCircle2, XCircle,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { referenceApi, type RefItem, type RefKind } from '../../api/reference'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 50

const TABS: { kind: RefKind; label: string; icon: React.ReactNode; color: string }[] = [
  { kind: 'nacionalidades', label: 'Nacionalidades', icon: <Flag size={14} />,   color: 'sky' },
  { kind: 'racas',          label: 'Raças',          icon: <Users size={14} />,  color: 'amber' },
  { kind: 'etnias',         label: 'Etnias',         icon: <Leaf size={14} />,   color: 'emerald' },
  { kind: 'logradouros',    label: 'Logradouros',    icon: <MapPin size={14} />, color: 'violet' },
]

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

type SortDir = 'asc' | 'desc'

export function SysReferencePage() {
  const [kind, setKind] = useState<RefKind>('nacionalidades')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortField, setSortField] = useState('codigo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<RefItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [formItem, setFormItem] = useState<RefItem | 'new' | null>(null)

  // Reset tudo ao trocar tab
  useEffect(() => {
    setSearch(''); setActiveFilter('all'); setSortField('codigo'); setSortDir('asc'); setPage(1)
  }, [kind])

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilter, sortField, sortDir])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await referenceApi.list(kind, {
        search: debouncedSearch || undefined,
        active: activeFilter === 'all' ? undefined : activeFilter === 'active',
        sort: sortField, dir: sortDir,
        page, pageSize: PAGE_SIZE,
      })
      setItems(res.items); setTotal(res.total)
    } catch (e) {
      toast.error('Falha ao carregar', e instanceof HttpError ? e.message : '')
      setItems([]); setTotal(0)
    } finally { setLoading(false) }
  }, [kind, debouncedSearch, activeFilter, sortField, sortDir, page])

  useEffect(() => { void reload() }, [reload])

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const handleSaved = () => { setFormItem(null); void reload() }

  const handleDelete = async (item: RefItem) => {
    if (!confirm(`Remover ${item.codigo} — ${item.descricao}?`)) return
    try {
      await referenceApi.remove(kind, item.id)
      toast.success('Registro removido')
      void reload()
    } catch (e) {
      toast.error('Falha ao remover', e instanceof HttpError ? e.message : '')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentTab = TABS.find(t => t.kind === kind)!

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dados de referência"
        subtitle="Cadastros compartilhados entre todos os municípios (códigos DATASUS)"
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(t => (
          <button key={t.kind} onClick={() => setKind(t.kind)} className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            kind === t.kind
              ? `border-${t.color}-500 text-${t.color}-600 dark:text-${t.color}-400`
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
          )}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Barra de ações */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar por código ou descrição..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>}
        </div>
        <div className="flex gap-1">
          {(['all','active','inactive'] as const).map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} className={cn(
              'px-3 py-2 rounded-lg text-xs font-medium transition-colors',
              activeFilter === f
                ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300',
            )}>
              {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : 'Inativos'}
            </button>
          ))}
        </div>
        <button onClick={() => setFormItem('new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium shrink-0">
          <Plus size={14} /> Novo
        </button>
      </div>

      {loading ? <LoadingBox /> : items.length === 0 ? <EmptyBox /> : (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <SortTh field="codigo" current={sortField} dir={sortDir} onSort={toggleSort}>Código</SortTh>
                  <SortTh field="descricao" current={sortField} dir={sortDir} onSort={toggleSort}>Descrição</SortTh>
                  <SortTh field="isSystem" current={sortField} dir={sortDir} onSort={toggleSort}>Origem</SortTh>
                  <SortTh field="active" current={sortField} dir={sortDir} onSort={toggleSort}>Status</SortTh>
                  <th className="px-4 py-2.5 text-right"><span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <code className={`text-xs font-mono font-bold text-${currentTab.color}-600 dark:text-${currentTab.color}-400 bg-${currentTab.color}-50 dark:bg-${currentTab.color}-950/40 px-2 py-0.5 rounded`}>{item.codigo}</code>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.descricao}</td>
                    <td className="px-4 py-3">
                      {item.isSystem
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><Lock size={10} />DATASUS</span>
                        : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">Customizado</span>}
                    </td>
                    <td className="px-4 py-3">
                      {item.active
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"><CheckCircle2 size={10} />Ativo</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"><XCircle size={10} />Inativo</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => setFormItem(item)} title="Editar" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil size={14} /></button>
                        {!item.isSystem && (
                          <button onClick={() => handleDelete(item)} title="Remover" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      {formItem && (
        <FormModal kind={kind} item={formItem === 'new' ? null : formItem} onClose={() => setFormItem(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}

// ─── Modal de edição / criação ──────────────────────────────────────────────

function FormModal({ kind, item, onClose, onSaved }: { kind: RefKind; item: RefItem | null; onClose: () => void; onSaved: () => void }) {
  const [codigo, setCodigo] = useState(item?.codigo ?? '')
  const [descricao, setDescricao] = useState(item?.descricao ?? '')
  const [active, setActive] = useState(item?.active ?? true)
  const [saving, setSaving] = useState(false)

  const isNew = item === null
  const isSystem = item?.isSystem ?? false
  const title = isNew ? 'Novo cadastro' : `Editar ${item!.codigo}`

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (isNew) {
        if (!codigo.trim() || !descricao.trim()) {
          toast.error('Código e descrição são obrigatórios')
          return
        }
        await referenceApi.create(kind, { codigo: codigo.trim(), descricao: descricao.trim(), active })
        toast.success('Registro criado')
      } else {
        await referenceApi.update(kind, item!.id, {
          descricao: isSystem ? undefined : descricao.trim(),
          active,
        })
        toast.success('Registro atualizado')
      }
      onSaved()
    } catch (e) {
      toast.error('Falha ao salvar', e instanceof HttpError ? e.message : '')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <form onSubmit={submit} className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {isSystem && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2">
              <Lock size={12} className="inline mr-1" />
              Registro oficial DATASUS. Apenas o status (ativo/inativo) pode ser alterado.
            </p>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Código</label>
            <input type="text" value={codigo} disabled={!isNew} onChange={e => setCodigo(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-500 font-mono" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Descrição</label>
            <input type="text" value={descricao} disabled={isSystem} onChange={e => setDescricao(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-500" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-4 h-4 rounded text-violet-600" />
            <span className="text-sm text-slate-700 dark:text-slate-300">Ativo</span>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-50">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function SortTh({ field, current, dir, onSort, children, className }: { field: string; current: string; dir: SortDir; onSort: (f: string) => void; children: React.ReactNode; className?: string }) {
  const active = field === current
  return (
    <th className={cn('px-4 py-2.5 text-left', className)}>
      <button onClick={() => onSort(field)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
        {children}
        {active ? dir === 'asc' ? <ChevronUp size={11} className="text-violet-500" /> : <ChevronDown size={11} className="text-violet-500" /> : <ChevronsUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  )
}
function LoadingBox() {
  return <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg></div>
}
function EmptyBox() {
  return <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Search size={28} className="mb-2 opacity-30" /><p className="text-sm">Nenhum registro encontrado</p></div>
}
function Pagination({ page, totalPages, total, pageSize, onPage }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
      <span>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} de {total.toLocaleString('pt-BR')}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={13} /></button>
        <span className="px-2 text-slate-400">{page} / {totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={13} /></button>
      </div>
    </div>
  )
}
