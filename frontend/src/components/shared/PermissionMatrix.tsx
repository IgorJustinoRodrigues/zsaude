// Matriz de permissões — layout em duas colunas estilo "Configurações".
//
// Esquerda (sticky, ~280px): lista vertical com todos os módulos
// agrupados em "Operacionais", "Administrativas" e "Em breve". Cada
// linha tem barra colorida + nome + contador + switch. Clicar no nome
// seleciona o módulo; clicar no switch liga/desliga tudo do módulo.
//
// Direita: só o módulo selecionado. Header com título e descrição, barra
// de ações em massa e as permissões agrupadas por recurso como
// subtítulos (sem cards aninhados). Cada linha é checkbox + descrição
// + código em cinza fantasma.

import { useEffect, useMemo, useState } from 'react'
import { Ban, CheckCheck, Eye, Minus } from 'lucide-react'
import type { RolePermissionEntry, RolePermissionState } from '../../api/roles'
import { cn } from '../../lib/utils'
import { actionLabel, moduleLabel, resourceLabel } from '../../lib/rbacLabels'
import { SYSTEMS } from '../../mock/users'
import type { SystemId } from '../../types'

const OPERATIONAL_IDS: SystemId[] = SYSTEMS.map(s => s.id)
const ADMIN_COLORS: Record<string, string> = {
  roles: '#7c3aed',
  users: '#0ea5e9',
  audit: '#f59e0b',
  ai:    '#ec4899',
  sys:   '#64748b',
}

interface Props {
  entries: RolePermissionEntry[]
  editable?: boolean
  onChange?: (code: string, state: RolePermissionState) => void
  className?: string
}

interface ModuleMeta {
  id: string
  name: string
  abbrev: string
  color: string
  entries: RolePermissionEntry[]
  active: number
  total: number
  kind: 'operational' | 'admin'
  empty: boolean
}

export function PermissionMatrix({ entries, editable = false, onChange, className }: Props) {
  const grouped = useMemo(() => groupByModule(entries), [entries])

  // Monta a lista de módulos com meta. Operacionais sempre aparecem (inclusive
  // "em breve"). Administrativos só aparecem se houver perms registradas.
  const modulesMeta: ModuleMeta[] = useMemo(() => {
    const out: ModuleMeta[] = []
    for (const id of OPERATIONAL_IDS) {
      const sys = SYSTEMS.find(s => s.id === id)!
      const mEntries = grouped[id] ?? []
      const active = mEntries.filter(e => isEffective(e)).length
      out.push({
        id, name: sys.name, abbrev: sys.abbrev, color: sys.color,
        entries: mEntries, active, total: mEntries.length,
        kind: 'operational', empty: mEntries.length === 0,
      })
    }
    const adminKeys = Object.keys(grouped).filter(
      k => !(OPERATIONAL_IDS as string[]).includes(k),
    ).sort()
    for (const k of adminKeys) {
      const mEntries = grouped[k]
      out.push({
        id: k, name: moduleLabel(k), abbrev: k.slice(0, 3).toUpperCase(),
        color: ADMIN_COLORS[k] ?? '#64748b',
        entries: mEntries,
        active: mEntries.filter(e => isEffective(e)).length,
        total: mEntries.length,
        kind: 'admin', empty: false,
      })
    }
    return out
  }, [grouped])

  // Módulo selecionado: começa no primeiro operacional não-empty ou no
  // primeiro admin. Se o selecionado sumir, cai pro primeiro disponível.
  const firstAvailable = useMemo(
    () => modulesMeta.find(m => !m.empty)?.id ?? '',
    [modulesMeta],
  )
  const [selectedId, setSelectedId] = useState<string>(firstAvailable)
  useEffect(() => {
    const exists = modulesMeta.some(m => m.id === selectedId && !m.empty)
    if (!exists) setSelectedId(firstAvailable)
  }, [firstAvailable, modulesMeta, selectedId])

  const selected = modulesMeta.find(m => m.id === selectedId)

  const bulkSet = (mod: string, state: RolePermissionState, filter?: (e: RolePermissionEntry) => boolean) => {
    if (!onChange) return
    const list = grouped[mod]
    if (!list) return
    for (const entry of list) {
      if (filter && !filter(entry)) continue
      if (entry.state !== state) onChange(entry.code, state)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        Nenhuma permissão registrada.
      </div>
    )
  }

  const operational = modulesMeta.filter(m => m.kind === 'operational' && !m.empty)
  const operationalEmpty = modulesMeta.filter(m => m.kind === 'operational' && m.empty)
  const administrative = modulesMeta.filter(m => m.kind === 'admin')

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4', className)}>
      {/* ── Coluna esquerda: navegação ─────────────────────────────── */}
      <aside className="lg:sticky lg:top-4 self-start space-y-4">
        {operational.length > 0 && (
          <NavSection label="Módulos operacionais">
            {operational.map(m => (
              <ModuleNavItem
                key={m.id}
                meta={m}
                selected={m.id === selectedId}
                editable={editable}
                onSelect={() => setSelectedId(m.id)}
                onToggleAll={() => bulkSet(m.id, m.active === m.total ? 'inherit' : 'grant')}
              />
            ))}
          </NavSection>
        )}

        {administrative.length > 0 && (
          <NavSection label="Administrativas">
            {administrative.map(m => (
              <ModuleNavItem
                key={m.id}
                meta={m}
                selected={m.id === selectedId}
                editable={editable}
                onSelect={() => setSelectedId(m.id)}
                onToggleAll={() => bulkSet(m.id, m.active === m.total ? 'inherit' : 'grant')}
              />
            ))}
          </NavSection>
        )}

        {operationalEmpty.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-1 mb-1 hover:text-muted-foreground">
              Em breve · {operationalEmpty.length}
            </summary>
            <div className="space-y-0.5 mt-1">
              {operationalEmpty.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-400 dark:text-slate-500"
                >
                  <span className="w-0.5 h-4 rounded-sm opacity-40 shrink-0" style={{ backgroundColor: m.color }} />
                  <span className="truncate flex-1">{m.name}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </aside>

      {/* ── Coluna direita: painel do módulo selecionado ────────────── */}
      <main>
        {selected
          ? <ModulePanel
              key={selected.id}
              meta={selected}
              editable={editable}
              onChange={onChange}
              onBulkSet={(state, filter) => bulkSet(selected.id, state, filter)}
            />
          : <div className="text-sm text-muted-foreground text-center py-10">
              Selecione um módulo à esquerda.
            </div>}
      </main>
    </div>
  )
}

// ─── Sub-seção da nav ────────────────────────────────────────────────────────

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-1 mb-1.5">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

// ─── Linha da nav (módulo) ───────────────────────────────────────────────────

interface ModuleNavItemProps {
  meta: ModuleMeta
  selected: boolean
  editable: boolean
  onSelect: () => void
  onToggleAll: () => void
}

function ModuleNavItem({ meta, selected, editable, onSelect, onToggleAll }: ModuleNavItemProps) {
  const on = meta.active > 0
  const full = meta.active === meta.total
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
        selected
          ? 'bg-slate-100 dark:bg-slate-800'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
      )}
    >
      <span
        className="w-0.5 h-5 rounded-sm shrink-0"
        style={{ backgroundColor: on ? meta.color : meta.color + '40' }}
      />
      <button
        onClick={onSelect}
        className="flex-1 min-w-0 flex items-center gap-2 text-left"
      >
        <span
          className={cn('text-sm truncate', selected ? 'font-semibold' : 'font-medium')}
          style={on ? { color: meta.color } : undefined}
        >
          {meta.name}
        </span>
        <span className={cn(
          'text-[10px] tabular-nums ml-auto',
          on ? 'text-muted-foreground' : 'text-muted-foreground/60',
        )}>
          {meta.active}/{meta.total}
        </span>
      </button>

      {editable && (
        <button
          role="switch"
          aria-checked={on}
          onClick={onToggleAll}
          title={on ? 'Remover todas' : 'Conceder todas'}
          className={cn(
            'relative w-7 h-4 rounded-full transition-colors shrink-0',
            on ? '' : 'bg-slate-200 dark:bg-slate-700',
          )}
          style={on ? { backgroundColor: full ? meta.color : meta.color + '80' } : undefined}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
              on && 'translate-x-3',
            )}
          />
        </button>
      )}
    </div>
  )
}

// ─── Painel do módulo (direita) ──────────────────────────────────────────────

interface ModulePanelProps {
  meta: ModuleMeta
  editable: boolean
  onChange?: (code: string, state: RolePermissionState) => void
  onBulkSet: (state: RolePermissionState, filter?: (e: RolePermissionEntry) => boolean) => void
}

function ModulePanel({ meta, editable, onChange, onBulkSet }: ModulePanelProps) {
  const { entries, color, name, active, total } = meta
  const resources = useMemo(() => groupByResource(entries), [entries])
  const resourceKeys = Object.keys(resources)
  const allGranted = active === total
  const anyGranted = active > 0

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4 border-b border-border"
        style={{ backgroundColor: anyGranted ? color + (allGranted ? '10' : '06') : undefined }}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-1 h-6 rounded-sm shrink-0"
            style={{ backgroundColor: color }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold truncate" style={anyGranted ? { color } : undefined}>
              {name}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {active} de {total} permissões concedidas
            </p>
          </div>
        </div>

        {editable && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            <BulkAction
              icon={<CheckCheck size={13} />}
              label="Marcar todas"
              color={color}
              onClick={() => onBulkSet('grant')}
              disabled={allGranted}
            />
            <BulkAction
              icon={<Eye size={13} />}
              label="Somente visualizar"
              color={color}
              onClick={() => {
                // 1. zera tudo
                onBulkSet('inherit')
                // 2. depois marca só actions de leitura
                onBulkSet('grant', e => isViewOnly(e))
              }}
            />
            <BulkAction
              icon={<Minus size={13} />}
              label="Limpar"
              color="#64748b"
              onClick={() => onBulkSet('inherit')}
              disabled={!anyGranted && !entries.some(e => e.state !== 'inherit')}
            />
          </div>
        )}
      </div>

      {/* Permissões por recurso — subtítulos, sem card dentro de card */}
      <div className="divide-y divide-border">
        {resourceKeys.map(rk => {
          const items = resources[rk]
          return (
            <section key={rk}>
              {resourceKeys.length > 1 && (
                <header className="px-5 py-2 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {resourceLabel(rk)}
                  </h4>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {items.filter(e => isEffective(e)).length}/{items.length}
                  </span>
                </header>
              )}
              <div className="px-5 py-2">
                {items.map(entry => (
                  <PermissionRow
                    key={entry.code}
                    entry={entry}
                    editable={editable}
                    onChange={onChange}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function BulkAction({
  label, icon, color, onClick, disabled,
}: {
  label: string
  icon: React.ReactNode
  color: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors',
        disabled
          ? 'opacity-40 cursor-not-allowed border-slate-200 text-slate-400'
          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:text-slate-300',
      )}
      style={!disabled ? { borderColor: color + '40', color } : undefined}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Linha de permissão ──────────────────────────────────────────────────────

interface PermissionRowProps {
  entry: RolePermissionEntry
  editable: boolean
  onChange?: (code: string, state: RolePermissionState) => void
}

function PermissionRow({ entry, editable, onChange }: PermissionRowProps) {
  const granted = entry.state === 'grant'
  const denied = entry.state === 'deny'
  const inherited = entry.state === 'inherit'
  const [showDeny, setShowDeny] = useState(denied)

  const toggle = () => {
    if (!onChange || denied) return
    onChange(entry.code, granted ? 'inherit' : 'grant')
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-1.5 px-1 rounded -mx-1 transition-colors',
        granted && 'bg-emerald-50/40 dark:bg-emerald-950/20',
        denied && 'bg-red-50/50 dark:bg-red-950/20',
        !granted && !denied && 'hover:bg-slate-50 dark:hover:bg-slate-800/30',
      )}
    >
      <label className={cn(
        'flex items-center gap-2.5 flex-1 min-w-0',
        editable && !denied && 'cursor-pointer',
      )}>
        <input
          type="checkbox"
          checked={granted}
          disabled={!editable || denied}
          onChange={toggle}
          className={cn(
            'w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0',
            denied && 'opacity-40',
          )}
        />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className={cn(
            'text-sm truncate',
            granted ? 'text-slate-800 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-300',
            denied && 'line-through text-red-600 dark:text-red-400',
          )}>
            {entry.description || actionLabel(entry.action)}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/50 truncate shrink-0">
            {entry.code}
          </span>
        </div>
        {inherited && entry.inheritedEffective !== null && (
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded shrink-0',
            entry.inheritedEffective ? 'bg-slate-100 text-slate-500' : 'bg-red-50 text-red-400',
          )}>
            {entry.inheritedEffective ? 'herdado ✓' : 'herdado ✗'}
          </span>
        )}
      </label>

      {editable && (
        <button
          onClick={() => {
            if (!onChange) return
            if (denied) { onChange(entry.code, 'inherit'); setShowDeny(false) }
            else { onChange(entry.code, 'deny'); setShowDeny(true) }
          }}
          title={denied ? 'Remover bloqueio' : 'Bloquear explicitamente'}
          className={cn(
            'shrink-0 p-1 rounded transition-colors',
            denied
              ? 'text-red-600 bg-red-100 hover:bg-red-200'
              : 'text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100',
          )}
        >
          <Ban size={12} />
        </button>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isViewOnly(entry: RolePermissionEntry): boolean {
  // Ações consideradas "somente leitura". Tudo o mais é escrita.
  return entry.action === 'view' || entry.action === 'export'
}

// Calcula ``effective`` a partir do state local — não depende do campo
// ``effective`` do backend (que fica desatualizado enquanto o user edita
// sem salvar). Contadores e badges usam isto pra refletir a mudança
// instantaneamente.
function isEffective(entry: RolePermissionEntry): boolean {
  if (entry.state === 'grant') return true
  if (entry.state === 'deny') return false
  return entry.inheritedEffective === true
}

function groupByModule(entries: RolePermissionEntry[]): Record<string, RolePermissionEntry[]> {
  const out: Record<string, RolePermissionEntry[]> = {}
  for (const e of entries) {
    out[e.module] = out[e.module] ?? []
    out[e.module].push(e)
  }
  for (const key in out) {
    out[key].sort((a, b) => {
      if (a.resource !== b.resource) return a.resource.localeCompare(b.resource)
      return a.action.localeCompare(b.action)
    })
  }
  return out
}

function groupByResource(entries: RolePermissionEntry[]): Record<string, RolePermissionEntry[]> {
  const out: Record<string, RolePermissionEntry[]> = {}
  for (const e of entries) {
    out[e.resource] = out[e.resource] ?? []
    out[e.resource].push(e)
  }
  return out
}

