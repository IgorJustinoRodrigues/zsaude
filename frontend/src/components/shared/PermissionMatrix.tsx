// Matriz de permissões de um perfil.
//
// Agrupa por módulo (tabs) → recurso (seção) → ação (linha com tri-state).
// Cada linha mostra:
//  - Nome e descrição da permissão
//  - Tri-state: grant (✓) | deny (✗) | inherit (—)
//  - Indicadores: efetivo (bg), herdado (legenda), override (badge)
//
// Props:
//  - entries: lista completa retornada pelo backend (RolePermissionEntry[]).
//  - editable: exibe controles se true; senão, read-only.
//  - onChange(code, state): callback para cada mudança local.
//  - highlightOverrides: destaca visualmente onde o role sobrescreve o pai.

import { useMemo, useState } from 'react'
import { Check, X, Minus, ChevronDown, ChevronRight } from 'lucide-react'
import type { RolePermissionEntry, RolePermissionState } from '../../api/roles'
import { cn } from '../../lib/utils'
import { actionLabel, moduleLabel, resourceLabel } from '../../lib/rbacLabels'

interface Props {
  entries: RolePermissionEntry[]
  editable?: boolean
  onChange?: (code: string, state: RolePermissionState) => void
  className?: string
}

export function PermissionMatrix({ entries, editable = false, onChange, className }: Props) {
  const grouped = useMemo(() => groupByModule(entries), [entries])
  const modules = Object.keys(grouped)
  const [activeModule, setActiveModule] = useState<string>(modules[0] ?? '')

  if (modules.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        Nenhuma permissão registrada.
      </div>
    )
  }

  return (
    <div className={cn('bg-white rounded-xl border border-border overflow-hidden', className)}>
      {/* Tabs por módulo */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {modules.map(mod => {
          const count = grouped[mod].length
          const active = grouped[mod].filter(e => e.effective).length
          return (
            <button
              key={mod}
              onClick={() => setActiveModule(mod)}
              className={cn(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeModule === mod
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {moduleLabel(mod)}
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {active}/{count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Conteúdo do módulo ativo */}
      <ModuleSection
        entries={grouped[activeModule] ?? []}
        editable={editable}
        onChange={onChange}
      />
    </div>
  )
}

// ─── Seção do módulo (agrupado por recurso) ─────────────────────────────────

interface ModuleSectionProps {
  entries: RolePermissionEntry[]
  editable: boolean
  onChange?: (code: string, state: RolePermissionState) => void
}

function ModuleSection({ entries, editable, onChange }: ModuleSectionProps) {
  const resources = useMemo(() => groupByResource(entries), [entries])

  return (
    <div className="divide-y divide-border">
      {Object.entries(resources).map(([resource, items]) => (
        <ResourceGroup
          key={resource}
          resource={resource}
          entries={items}
          editable={editable}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

interface ResourceGroupProps {
  resource: string
  entries: RolePermissionEntry[]
  editable: boolean
  onChange?: (code: string, state: RolePermissionState) => void
}

function ResourceGroup({ resource, entries, editable, onChange }: ResourceGroupProps) {
  const [open, setOpen] = useState(true)
  const active = entries.filter(e => e.effective).length
  const hasOverrides = entries.some(e => e.state !== 'inherit')

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-5 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-sm font-semibold flex-1">{resourceLabel(resource)}</span>
        {hasOverrides && (
          <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
            customizado
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {active}/{entries.length}
        </span>
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border">
          {entries.map(entry => (
            <PermissionRow
              key={entry.code}
              entry={entry}
              editable={editable}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Linha de permissão ─────────────────────────────────────────────────────

interface PermissionRowProps {
  entry: RolePermissionEntry
  editable: boolean
  onChange?: (code: string, state: RolePermissionState) => void
}

function PermissionRow({ entry, editable, onChange }: PermissionRowProps) {
  const explainInherit =
    entry.inheritedEffective === null
      ? 'sem definição do pai'
      : entry.inheritedEffective
      ? 'herdado: concedido'
      : 'herdado: negado'

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-3',
        entry.effective ? 'bg-emerald-50/20' : '',
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{entry.description || actionLabel(entry.action)}</p>
        <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5 break-all">{entry.code}</p>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
        <div className="text-xs text-muted-foreground whitespace-nowrap">{explainInherit}</div>
        <TriState
          value={entry.state}
          editable={editable}
          onChange={state => onChange?.(entry.code, state)}
        />
      </div>
    </div>
  )
}

// ─── Controle tri-state ─────────────────────────────────────────────────────

interface TriStateProps {
  value: RolePermissionState
  editable: boolean
  onChange?: (state: RolePermissionState) => void
}

function TriState({ value, editable, onChange }: TriStateProps) {
  const states: Array<{ key: RolePermissionState; icon: React.ReactNode; label: string; cls: string }> = [
    { key: 'grant',   icon: <Check size={15} />, label: 'Conceder',  cls: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
    { key: 'deny',    icon: <X size={15} />,     label: 'Negar',     cls: 'text-red-600 border-red-200 bg-red-50' },
    { key: 'inherit', icon: <Minus size={15} />, label: 'Herdar',    cls: 'text-slate-500 border-slate-200 bg-slate-50' },
  ]

  if (!editable) {
    const current = states.find(s => s.key === value) ?? states[2]
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium',
          current.cls,
        )}
        title={current.label}
      >
        {current.icon}
        {current.label}
      </span>
    )
  }

  return (
    <div className="inline-flex rounded border border-border overflow-hidden">
      {states.map(s => (
        <button
          key={s.key}
          onClick={() => onChange?.(s.key)}
          title={s.label}
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-xs font-medium border-l border-border first:border-l-0 transition-colors',
            value === s.key
              ? s.cls
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {s.icon}
        </button>
      ))}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function groupByModule(entries: RolePermissionEntry[]): Record<string, RolePermissionEntry[]> {
  const out: Record<string, RolePermissionEntry[]> = {}
  for (const e of entries) {
    out[e.module] = out[e.module] ?? []
    out[e.module].push(e)
  }
  for (const key in out) {
    out[key].sort((a, b) => a.code.localeCompare(b.code))
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
