// Seção reutilizável de procedimentos SIGTAP dum atendimento — Fase F.
//
// Mostra: lista dos marcados (com origem manual/auto), botão "Adicionar"
// que abre busca filtrada pelo CBO do profissional. Sem CBO vinculado, a
// busca já vem vazia (política do backend).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Clock, Loader2, Plus, Search, Trash2, Wand2, X,
} from 'lucide-react'
import { clnApi, type AttendanceProcedure, type PendingAutoProcedure, type ProcedureSearchResult } from '../../../api/cln'
import { HttpError } from '../../../api/client'
import { toast } from '../../../store/toastStore'
import { confirmDialog } from '../../../store/dialogStore'
import { cn } from '../../../lib/utils'

const SOURCE_META: Record<AttendanceProcedure['source'], { label: string; bg: string; fg: string }> = {
  manual: {
    label: 'Manual',
    bg: 'bg-slate-100 dark:bg-slate-800',
    fg: 'text-slate-600 dark:text-slate-300',
  },
  auto_triagem: {
    label: 'Auto · Triagem',
    bg: 'bg-violet-100 dark:bg-violet-950',
    fg: 'text-violet-700 dark:text-violet-300',
  },
  auto_atendimento: {
    label: 'Auto · Atendimento',
    bg: 'bg-emerald-100 dark:bg-emerald-950',
    fg: 'text-emerald-700 dark:text-emerald-300',
  },
}

export function ProceduresSection({ ticketId }: { ticketId: string }) {
  const [items, setItems] = useState<AttendanceProcedure[]>([])
  const [pending, setPending] = useState<PendingAutoProcedure[]>([])
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, pend] = await Promise.all([
        clnApi.listProcedures(ticketId),
        clnApi.listPendingProcedures(ticketId).catch(() => [] as PendingAutoProcedure[]),
      ])
      setItems(list)
      setPending(pend)
    } catch (err) {
      if (err instanceof HttpError) toast.error('Procedimentos', err.message)
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => { void load() }, [load])

  async function handleRemove(p: AttendanceProcedure) {
    const ok = await confirmDialog({
      title: 'Remover procedimento?',
      message: `${p.codigo} · ${p.nome} será desmarcado.`,
      confirmLabel: 'Remover',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await clnApi.removeProcedure(ticketId, p.id)
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Remover', err.message)
    }
  }

  async function handleAdd(codigo: string) {
    try {
      await clnApi.addProcedure(ticketId, codigo)
      setSearchOpen(false)
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Adicionar', err.message)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity size={14} /> Procedimentos SIGTAP
        </h3>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white"
        >
          <Plus size={13} /> Adicionar
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Marcados automaticamente conforme o fluxo (triagem/atendimento).
        Busque outros procedimentos permitidos ao seu CBO.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 && pending.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          Nenhum procedimento marcado.
        </p>
      ) : (
        <ul className="space-y-2">
          {/* Ghost cards — pendentes de auto-marcação */}
          {pending.map(p => (
            <li
              key={`pending-${p.codigo}`}
              className="flex items-center gap-3 border border-dashed border-border rounded-lg px-3 py-2 bg-muted/30"
              title={
                p.trigger === 'on_release'
                  ? 'Será marcado automaticamente ao clicar em "Liberar pra atendimento"'
                  : 'Será marcado automaticamente ao clicar em "Finalizar"'
              }
            >
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0 opacity-70">
                {formatCodigo(p.codigo)}
              </span>
              <span className="flex-1 min-w-0 text-sm truncate text-muted-foreground">
                {p.nome}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <Clock size={9} />
                {p.trigger === 'on_release' ? 'Ao liberar' : 'Ao finalizar'}
              </span>
            </li>
          ))}
          {items.map(p => {
            const m = SOURCE_META[p.source]
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 border border-border rounded-lg px-3 py-2"
              >
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">
                  {formatCodigo(p.codigo)}
                </span>
                <span className="flex-1 min-w-0 text-sm truncate">{p.nome}</span>
                {p.quantidade > 1 && (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    ×{p.quantidade}
                  </span>
                )}
                <span className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0',
                  m.bg, m.fg,
                )}>
                  {p.source !== 'manual' && <Wand2 size={9} />} {m.label}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(p)}
                  title="Remover"
                  className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {searchOpen && (
        <SearchProcedureModal
          existing={new Set(items.map(i => i.codigo))}
          onPick={handleAdd}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  )
}

function SearchProcedureModal({
  existing, onPick, onClose,
}: {
  existing: Set<string>
  onPick: (codigo: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ProcedureSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true)
      try {
        const list = await clnApi.searchProcedures(q, 30)
        setResults(list)
      } catch (err) {
        if (err instanceof HttpError) toast.error('Buscar', err.message)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [q])

  const filtered = useMemo(
    () => results.filter(r => !existing.has(r.codigo)),
    [results, existing],
  )

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
      >
        <header className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Adicionar procedimento</h3>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </header>
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por código ou nome…"
              autoFocus
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              {q
                ? 'Nenhum procedimento encontrado pra este CBO.'
                : 'Digite pra buscar. Sem CBO vinculado, a busca não retorna resultados.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map(r => (
                <li key={r.codigo}>
                  <button
                    onClick={() => onPick(r.codigo)}
                    className="w-full text-left p-3 hover:bg-muted rounded-lg flex items-center gap-3"
                  >
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {formatCodigo(r.codigo)}
                    </span>
                    <span className="flex-1 min-w-0 text-sm truncate">{r.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function formatCodigo(codigo: string): string {
  // Formato SIGTAP: XX.XX.XX.XXX-X
  if (codigo.length !== 10) return codigo
  return `${codigo.slice(0, 2)}.${codigo.slice(2, 4)}.${codigo.slice(4, 6)}.${codigo.slice(6, 9)}-${codigo.slice(9)}`
}
