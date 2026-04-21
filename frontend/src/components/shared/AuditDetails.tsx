// Exibição bonita do campo `details` de audit logs.
//
// Detecta os formatos mais comuns e renderiza de forma legível:
//  - changes: { campo: {from, to} }     → tabela de mudanças de atributos
//  - changes.accesses: {added,removed,changed} → lista de vínculos alterados
//  - changes: [{code, from, to}]        → lista de tri-state grant/deny/inherit
//  - body: {...}                        → key-value do payload
//  - path/method/status                 → linha de metadado da requisição
//  - demais chaves                      → key-value genérico
//
// Recebe o objeto já parseado; se vier string JSON, passa por JSON.parse antes.

import { useMemo } from 'react'
import { ArrowRight, Check, X, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { actionLabel, resourceLabel, moduleLabel } from '../../lib/rbacLabels'

const FIELD_LABELS: Record<string, string> = {
  name:              'Nome',
  shortName:         'Nome curto',
  email:             'E-mail',
  phone:             'Telefone',
  cpf:               'CPF',
  cnes:              'CNES',
  type:              'Tipo',
  state:             'UF',
  ibge:              'IBGE',
  status:            'Status',
  level:             'Nível',
  primaryRole:       'Cargo',
  description:       'Descrição',
  login:             'Nome de acesso',
  role:              'Perfil',
  roleId:            'Perfil',
  roleName:          'Perfil',
  parentId:          'Perfil pai',
  archived:          'Arquivado',
  facilityId:        'ID da unidade',
  facilityName:      'Unidade',
  facilityShortName: 'Unidade (sigla)',
  facilityType:      'Tipo da unidade',
  municipalityId:    'ID do município',
  municipalityName:  'Município',
  municipalityState: 'UF',
  municipalityIbge:  'IBGE',
  enabledModules:    'Módulos habilitados',
  modules:           'Módulos concedidos',
  selectedModule:    'Módulo escolhido',
  accesses:          'Vínculos',
  targetUserName:    'Usuário alterado',
  facilitiesArchived:'Unidades também arquivadas',
}

// Campos puramente técnicos — não exibir na seção "Contexto" do detail.
const HIDDEN_CONTEXT_FIELDS = new Set([
  'targetUserId',
  'facilityAccessId',
  'count',
])

const STATE_LABELS: Record<string, string> = {
  grant:   'Conceder',
  deny:    'Negar',
  inherit: 'Herdar',
}

const STATE_ICON: Record<string, React.ReactNode> = {
  grant:   <Check size={12} />,
  deny:    <X size={12} />,
  inherit: <Minus size={12} />,
}

const STATE_CLS: Record<string, string> = {
  grant:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  deny:    'bg-red-50 text-red-700 border-red-200',
  inherit: 'bg-slate-100 text-slate-600 border-slate-200',
}

interface Props {
  details: unknown
  className?: string
}

export function AuditDetails({ details, className }: Props) {
  const obj = useMemo(() => parseDetails(details), [details])
  if (!obj || Object.keys(obj).length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sem detalhes.</p>
  }

  const nodes: React.ReactNode[] = []

  // ── changes: top-level ────────────────────────────────────────────────
  if (obj.changes !== undefined) {
    nodes.push(<ChangesBlock key="changes" changes={obj.changes} />)
  }

  // ── metadata de requisição ────────────────────────────────────────────
  const hasReq = obj.method || obj.path || obj.status !== undefined
  if (hasReq) {
    nodes.push(
      <Section key="req" title="Requisição">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {obj.method && <Badge color="slate">{obj.method}</Badge>}
          {obj.path && <code className="font-mono text-slate-700 dark:text-slate-200 break-all">{obj.path}</code>}
          {obj.status !== undefined && (
            <Badge color={statusColor(obj.status)}>HTTP {obj.status}</Badge>
          )}
          {obj.query ? <code className="text-slate-400 font-mono">?{obj.query}</code> : null}
        </div>
      </Section>,
    )
  }

  // ── body (quando middleware logou body direto) ────────────────────────
  if (obj.body !== undefined && obj.body !== null) {
    nodes.push(
      <Section key="body" title="Dados enviados">
        <KeyValueTree value={obj.body} />
      </Section>,
    )
  }

  // ── campos de contexto (targetUserName, etc.) ─────────────────────────
  const metaRows: Array<[string, unknown]> = []
  const systemKeys = new Set(['changes', 'body', 'method', 'path', 'status', 'query'])
  // Oculta IDs quando o Name correspondente está presente — evita ruído.
  const idHiddenIfNamePresent: Array<[string, string]> = [
    ['municipalityId', 'municipalityName'],
    ['facilityId',     'facilityName'],
    ['roleId',         'roleName'],
  ]
  const hiddenIds = new Set<string>()
  for (const [idKey, nameKey] of idHiddenIfNamePresent) {
    if (obj[nameKey] !== undefined && obj[nameKey] !== null && obj[nameKey] !== '') {
      hiddenIds.add(idKey)
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (systemKeys.has(k) || HIDDEN_CONTEXT_FIELDS.has(k) || hiddenIds.has(k)) continue
    metaRows.push([k, v])
  }
  if (metaRows.length > 0) {
    nodes.push(
      <Section key="meta" title="Contexto">
        <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {metaRows.map(([k, v]) => (
            <FieldRow key={k} label={labelFor(k)} value={v} />
          ))}
        </dl>
      </Section>,
    )
  }

  return <div className={cn('space-y-4', className)}>{nodes}</div>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDetails(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return null }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return null
}

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? key
}

function statusColor(code: unknown): 'emerald' | 'amber' | 'red' | 'slate' {
  const n = typeof code === 'number' ? code : Number(code)
  if (n >= 500) return 'red'
  if (n >= 400) return 'amber'
  if (n >= 200 && n < 300) return 'emerald'
  return 'slate'
}

// ─── Changes block ──────────────────────────────────────────────────────────

function ChangesBlock({ changes }: { changes: unknown }) {
  // Formato lista [{code, from, to}] — mudança de permissões
  if (Array.isArray(changes)) {
    return (
      <Section title="Permissões alteradas">
        <PermissionChanges items={changes as Array<{ code: string; from?: string; to: string }>} />
      </Section>
    )
  }
  if (!changes || typeof changes !== 'object') return null

  const entries = Object.entries(changes as Record<string, unknown>)
  const simpleFields = entries.filter(
    ([k]) => k !== 'accesses',
  ) as Array<[string, { from?: unknown; to?: unknown }]>
  const accessesNode = (changes as Record<string, unknown>).accesses

  return (
    <>
      {simpleFields.length > 0 && (
        <Section title="Campos alterados">
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {simpleFields.map(([field, change]) => (
              <FieldChangeRow key={field} field={field} change={change} />
            ))}
          </div>
        </Section>
      )}
      {accessesNode ? (
        <Section title="Vínculos (município/unidade)">
          <AccessChangesBlock accesses={accessesNode as Record<string, unknown>} />
        </Section>
      ) : null}
    </>
  )
}

function FieldChangeRow({ field, change }: {
  field: string
  change: { from?: unknown; to?: unknown }
}) {
  const from = formatScalar(change?.from)
  const to   = formatScalar(change?.to)
  return (
    <div className="px-4 py-2.5 space-y-1">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {labelFor(field)}
      </p>
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-slate-500 line-through break-all">{from}</span>
        <ArrowRight size={13} className="text-slate-400 shrink-0" />
        <span className="text-emerald-700 dark:text-emerald-400 font-semibold break-all">{to}</span>
      </div>
    </div>
  )
}

function PermissionChanges({ items }: { items: Array<{ code: string; from?: string; to: string }> }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
      {items.map(it => {
        const parts = it.code.split('.')
        const modLabel = moduleLabel(parts[0] ?? '')
        const resLabel = parts[1] ? resourceLabel(parts[1]) : ''
        const actLabel = parts[2] ? actionLabel(parts[2]) : it.code
        return (
          <div key={it.code} className="px-4 py-2.5 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">{modLabel} · {resLabel} · <strong>{actLabel}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {it.from !== undefined && <StateTag state={it.from} />}
              <ArrowRight size={12} className="text-slate-400 shrink-0" />
              <StateTag state={it.to} />
              <code className="text-[10px] text-muted-foreground ml-auto font-mono">{it.code}</code>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StateTag({ state }: { state: string }) {
  const cls = STATE_CLS[state] ?? 'bg-slate-100 text-slate-600 border-slate-200'
  const icon = STATE_ICON[state] ?? null
  const label = STATE_LABELS[state] ?? state
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium', cls)}>
      {icon}
      {label}
    </span>
  )
}

interface AccessItem {
  facilityId?: string
  facilityName?: string
  municipalityName?: string
  roleId?: string
  roleName?: string
  from?: string
  to?: string
}

function facilityLabel(a: AccessItem): string {
  const name = a.facilityName || a.facilityId || '—'
  return a.municipalityName ? `${name} · ${a.municipalityName}` : name
}

function AccessChangesBlock({ accesses }: { accesses: Record<string, unknown> }) {
  const added   = (accesses.added   ?? []) as AccessItem[]
  const removed = (accesses.removed ?? []) as AccessItem[]
  const changed = (accesses.changed ?? []) as AccessItem[]
  return (
    <div className="space-y-3 text-sm">
      {added.length > 0 && (
        <div>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider mb-1.5">
            Adicionados ({added.length})
          </p>
          <ul className="space-y-1.5">
            {added.map((a, i) => (
              <li key={i} className="text-slate-700 dark:text-slate-200">
                <span className="font-medium">{facilityLabel(a)}</span>
                {a.roleName && <span className="text-slate-500"> — perfil <span className="font-medium text-slate-700 dark:text-slate-200">{a.roleName}</span></span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {removed.length > 0 && (
        <div>
          <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider mb-1.5">
            Removidos ({removed.length})
          </p>
          <ul className="space-y-1.5">
            {removed.map((r, i) => (
              <li key={i} className="text-slate-700 dark:text-slate-200">
                {facilityLabel(r)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {changed.length > 0 && (
        <div>
          <p className="text-[11px] text-amber-600 dark:text-amber-500 font-semibold uppercase tracking-wider mb-1.5">
            Perfil alterado ({changed.length})
          </p>
          <ul className="space-y-2">
            {changed.map((c, i) => (
              <li key={i} className="text-slate-700 dark:text-slate-200">
                <div className="font-medium">{facilityLabel(c)}</div>
                <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap">
                  <span className="line-through text-slate-500">{c.from}</span>
                  <ArrowRight size={12} className="text-slate-400 shrink-0" />
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{c.to}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Key-value tree (para body/contexto genérico) ──────────────────────────

function KeyValueTree({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground italic">—</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground italic">lista vazia</span>
    return (
      <ol className="space-y-1 list-decimal list-inside text-xs">
        {value.map((item, i) => (
          <li key={i} className="pl-1">
            <KeyValueTree value={item} />
          </li>
        ))}
      </ol>
    )
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {entries.map(([k, v]) => (
          <FieldRow key={k} label={labelFor(k)} value={v} />
        ))}
      </dl>
    )
  }
  return <span className="text-slate-700 dark:text-slate-200 break-all">{formatScalar(value)}</span>
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  const isComplex = value !== null && typeof value === 'object'
  return (
    <>
      <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{label}</dt>
      <dd className={cn('text-slate-700 dark:text-slate-200 break-all', isComplex && 'sm:pl-0')}>
        {isComplex ? <KeyValueTree value={value} /> : formatScalar(value)}
      </dd>
    </>
  )
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (v === '***') return '•••'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return v.toLocaleString('pt-BR')
  return JSON.stringify(v)
}

// ─── Primitives ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      {children}
    </div>
  )
}

const BADGE_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  red:     'bg-red-50 text-red-700 border-red-200',
  slate:   'bg-slate-100 text-slate-700 border-slate-200',
}

function Badge({ children, color = 'slate' }: { children: React.ReactNode; color?: 'emerald' | 'amber' | 'red' | 'slate' }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold',
      BADGE_COLORS[color],
    )}>
      {children}
    </span>
  )
}
