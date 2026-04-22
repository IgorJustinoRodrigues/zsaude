// Tela MASTER de totens lógicos — município ou unidade.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Archive, ArchiveRestore, ChevronDown, ChevronRight, CreditCard, Edit3,
  IdCard, Loader2, MonitorSmartphone, Plus, ScanFace, Settings2, Trash2,
  User, X,
} from 'lucide-react'
import {
  totensAdminApi,
  type Totem,
  type TotemCapture,
  type TotemNumbering,
  type ResetStrategy,
} from '../../api/totens'
import { sectorsAdminApi, type Sector } from '../../api/sectors'
import { directoryApi, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { confirmDialog } from '../../store/dialogStore'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ScopeHeader, useScopeHeader } from './SysModulesConfigPages'

type Scope = 'municipality' | 'facility'

const DEFAULT_CAPTURE: TotemCapture = { cpf: true, cns: true, face: false, manualName: true }

const DEFAULT_NUMBERING: TotemNumbering = {
  ticketPrefixNormal: 'R',
  ticketPrefixPriority: 'P',
  resetStrategy: 'daily',
  numberPadding: 3,
}

const RESET_LABELS: Record<ResetStrategy, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  monthly: 'Mensal',
  never: 'Nunca',
}

export function SysMunicipalityTotensPage() {
  return <TotensPage scope="municipality" />
}

export function SysFacilityTotensPage() {
  return <TotensPage scope="facility" />
}

function TotensPage({ scope }: { scope: Scope }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { title, subtitle, loading: loadingHeader } = useScopeHeader(scope, id)

  const [loading, setLoading] = useState(true)
  const [own, setOwn] = useState<Totem[]>([])
  const [inherited, setInherited] = useState<Totem[]>([])
  const [editing, setEditing] = useState<Totem | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  // Setores disponíveis no escopo — usados no dropdown de "setor padrão".
  // Carregados sob demanda quando o modal abre.
  const [sectors, setSectors] = useState<Sector[]>([])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      if (scope === 'municipality') {
        const list = await totensAdminApi.listMunicipality(id)
        setOwn(list)
        setInherited([])
      } else {
        const all = await directoryApi.listFacilities(undefined, 'all')
        const fac = all.find((f: FacilityDto) => f.id === id)
        if (!fac) throw new Error('Unidade não encontrada')
        const [ownList, munList] = await Promise.all([
          totensAdminApi.listFacility(id),
          totensAdminApi.listMunicipality(fac.municipalityId),
        ])
        setOwn(ownList)
        setInherited(munList.filter(t => !t.archived))
      }
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao carregar.'
      toast.error('Erro', msg)
    } finally {
      setLoading(false)
    }
  }, [id, scope])

  useEffect(() => { void load() }, [load])

  // Carrega setores uma vez pra usar no modal (dropdown de setor padrão).
  useEffect(() => {
    if (!id) return
    const fetch = scope === 'municipality'
      ? sectorsAdminApi.listMunicipality(id)
      : sectorsAdminApi.listFacility(id)
    fetch
      .then(list => setSectors(list.filter(s => !s.archived)))
      .catch(() => { /* silencioso — campo fica em modo livre */ })
  }, [id, scope])

  if (!id) return <div className="text-sm text-red-500">Identificador inválido.</div>

  const sectionsHref =
    scope === 'municipality' ? `/sys/municipios/${id}/recursos` : `/sys/unidades/${id}/recursos`

  const active = own.filter(t => !t.archived)
  const archived = own.filter(t => t.archived)

  async function doAction<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    try { return await fn() }
    catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha.'
      toast.error('Erro', msg)
      return null
    } finally { setBusy(false) }
  }

  async function handleArchiveToggle(t: Totem) {
    const res = await doAction(() => totensAdminApi.update(t.id, { archived: !t.archived }))
    if (res) await load()
  }

  async function handleDelete(t: Totem) {
    const ok = await confirmDialog({
      title: 'Excluir totem',
      message: `O totem "${t.name}" será removido definitivamente. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    const res = await doAction(() => totensAdminApi.remove(t.id))
    if (res !== null) { toast.success('Totem excluído'); await load() }
  }

  async function handleSave(
    existing: Totem | null,
    data: {
      name: string
      capture: TotemCapture
      priorityPrompt: boolean
      numbering: TotemNumbering
      defaultSectorName: string | null
    },
  ) {
    if (existing) {
      const res = await doAction(() => totensAdminApi.update(existing.id, data))
      if (res) { toast.success('Totem atualizado'); setEditing(null); await load() }
    } else {
      const create = scope === 'municipality'
        ? () => totensAdminApi.createMunicipality(id!, data)
        : () => totensAdminApi.createFacility(id!, data)
      const res = await doAction(create)
      if (res) { toast.success('Totem criado'); setCreating(false); await load() }
    }
  }

  return (
    <div className="space-y-5">
      <ScopeHeader
        scope={scope}
        loading={loadingHeader}
        title={title}
        subtitle={subtitle}
        breadcrumb={
          <span className="flex items-center gap-1 text-violet-600 font-medium">
            <MonitorSmartphone size={11} /> Recursos · Totens
          </span>
        }
        onBack={() => navigate(sectionsHref)}
      />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-1 min-w-[200px]">
          {scope === 'municipality'
            ? 'Templates do município. Todas as unidades veem estes totens; cada unidade pode também criar os próprios.'
            : 'Totens desta unidade + templates herdados do município. Dispositivos físicos são vinculados a um totem no pareamento.'
          }
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={busy || loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <Plus size={14} /> Novo totem
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="text-slate-400 animate-spin" />
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                {scope === 'municipality' ? 'Totens' : `Próprios desta unidade (${active.length})`}
              </h3>
              <ul className="space-y-2">
                {active.map(t => (
                  <TotemRow
                    key={t.id}
                    totem={t}
                    busy={busy}
                    onEdit={() => setEditing(t)}
                    onArchive={() => handleArchiveToggle(t)}
                    onDelete={() => handleDelete(t)}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
              {scope === 'municipality'
                ? 'Nenhum totem configurado. Crie o primeiro template acima.'
                : 'Esta unidade não tem totens próprios. Use os herdados abaixo ou crie um novo.'
              }
            </div>
          )}

          {scope === 'facility' && inherited.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Herdados do município ({inherited.length})
                </h3>
                <span className="text-[11px] text-slate-400">somente leitura</span>
              </div>
              <ul className="space-y-1.5">
                {inherited.map(t => (
                  <li
                    key={t.id}
                    className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 flex items-center gap-3"
                  >
                    <CaptureIcons capture={t.capture} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {summarizeCapture(t.capture)}
                        {t.priorityPrompt && ' · pergunta prioridade'}
                      </p>
                    </div>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Município
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {archived.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Arquivados ({archived.length})
              </h3>
              <ul className="space-y-1.5">
                {archived.map(t => (
                  <li
                    key={t.id}
                    className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 flex items-center gap-3 opacity-70"
                  >
                    <span className="flex-1 text-sm truncate">{t.name}</span>
                    <button type="button" disabled={busy} onClick={() => handleArchiveToggle(t)} title="Desarquivar" className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <ArchiveRestore size={14} />
                    </button>
                    <button type="button" disabled={busy} onClick={() => handleDelete(t)} title="Excluir" className="p-1.5 rounded text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {(creating || editing) && (
        <TotemModal
          totem={editing}
          sectors={sectors}
          busy={busy}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSave={data => handleSave(editing, data)}
        />
      )}
    </div>
  )
}

// ─── Linha ──────────────────────────────────────────────────────────────────

interface RowProps {
  totem: Totem
  busy: boolean
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}

function TotemRow({ totem, busy, onEdit, onArchive, onDelete }: RowProps) {
  return (
    <li className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 flex items-center gap-3">
      <CaptureIcons capture={totem.capture} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate inline-flex items-center gap-2">
          {totem.name}
          {totem.defaultSectorName && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-wider">
              {totem.defaultSectorName}
            </span>
          )}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {summarizeCapture(totem.capture)}
          {totem.priorityPrompt && ' · pergunta prioridade'}
          {' · '}
          {totem.numbering.ticketPrefixNormal}/{totem.numbering.ticketPrefixPriority}
          {' · reset '}{(RESET_LABELS[totem.numbering.resetStrategy] || totem.numbering.resetStrategy).toLowerCase()}
        </p>
      </div>
      <button type="button" onClick={onEdit} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar">
        <Edit3 size={14} />
      </button>
      <button type="button" onClick={onArchive} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40" title="Arquivar">
        <Archive size={14} />
      </button>
      <button type="button" onClick={onDelete} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" title="Excluir">
        <Trash2 size={14} />
      </button>
    </li>
  )
}

function CaptureIcons({ capture }: { capture: TotemCapture }) {
  const items: Array<[boolean, React.ReactNode, string]> = [
    [capture.cpf,        <CreditCard key="cpf"   size={12} />, 'CPF'],
    [capture.cns,        <IdCard key="cns"       size={12} />, 'CNS'],
    [capture.face,       <ScanFace key="face"    size={12} />, 'Face'],
    [capture.manualName, <User key="name"        size={12} />, 'Nome'],
  ]
  return (
    <div className="flex items-center gap-1 shrink-0">
      {items.map(([on, icon, label]) => (
        <span
          key={label}
          title={`${label}: ${on ? 'habilitado' : 'desabilitado'}`}
          className={cn(
            'p-1 rounded',
            on
              ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600',
          )}
        >
          {icon}
        </span>
      ))}
    </div>
  )
}

function summarizeCapture(c: TotemCapture): string {
  const parts: string[] = []
  if (c.cpf) parts.push('CPF')
  if (c.cns) parts.push('CNS')
  if (c.face) parts.push('Face')
  if (c.manualName) parts.push('Nome manual')
  return parts.length === 0 ? 'Sem identificação' : parts.join(' · ')
}

// ─── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  totem: Totem | null
  sectors: Sector[]
  busy: boolean
  onClose: () => void
  onSave: (data: {
    name: string
    capture: TotemCapture
    priorityPrompt: boolean
    numbering: TotemNumbering
    defaultSectorName: string | null
  }) => void
}

function TotemModal({ totem, sectors, busy, onClose, onSave }: ModalProps) {
  const [name, setName] = useState(totem?.name ?? '')
  const [capture, setCapture] = useState<TotemCapture>(totem?.capture ?? DEFAULT_CAPTURE)
  const [priorityPrompt, setPriorityPrompt] = useState(totem?.priorityPrompt ?? true)
  const [numbering, setNumbering] = useState<TotemNumbering>(totem?.numbering ?? DEFAULT_NUMBERING)
  const [defaultSectorName, setDefaultSectorName] = useState<string | null>(
    totem?.defaultSectorName ?? null,
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const hasAnyCapture = capture.cpf || capture.cns || capture.face || capture.manualName
  const prefixesOk = numbering.ticketPrefixNormal.trim().length > 0
                     && numbering.ticketPrefixPriority.trim().length > 0
  const paddingOk = numbering.numberPadding >= 1 && numbering.numberPadding <= 6
  const canSave = name.trim().length > 0 && hasAnyCapture && prefixesOk && paddingOk && !busy

  function submit() {
    if (!canSave) return
    onSave({
      name: name.trim(),
      capture,
      priorityPrompt,
      numbering: {
        ticketPrefixNormal: numbering.ticketPrefixNormal.trim().toUpperCase(),
        ticketPrefixPriority: numbering.ticketPrefixPriority.trim().toUpperCase(),
        resetStrategy: numbering.resetStrategy,
        numberPadding: numbering.numberPadding,
      },
      defaultSectorName: defaultSectorName?.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold">{totem ? 'Editar totem' : 'Novo totem'}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Totem Entrada"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 block">
              Formas de identificação aceitas
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CaptureCheckbox label="CPF"                   checked={capture.cpf}        onChange={b => setCapture({ ...capture, cpf: b })} />
              <CaptureCheckbox label="CNS"                   checked={capture.cns}        onChange={b => setCapture({ ...capture, cns: b })} />
              <CaptureCheckbox label="Reconhecimento facial" checked={capture.face}       onChange={b => setCapture({ ...capture, face: b })} />
              <CaptureCheckbox label="Nome manual"           checked={capture.manualName} onChange={b => setCapture({ ...capture, manualName: b })} />
            </div>
            {!hasAnyCapture && (
              <p className="text-[11px] text-red-500 mt-2">
                Selecione ao menos uma forma de identificação.
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={priorityPrompt}
                onChange={e => setPriorityPrompt(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
              />
              Perguntar prioridade (idoso, gestante, etc.)
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Setor destino <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <select
              value={defaultSectorName ?? ''}
              onChange={e => setDefaultSectorName(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Recepção (padrão)</option>
              {sectors.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Se definido, a senha vai direto pra fila deste setor e pula a
              recepção. Útil pra totens que ficam dentro de um setor específico.
            </p>
          </div>

          {/* Avançado (numeração) ---------------------------------- */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={() => setAdvancedOpen(o => !o)}
              className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <span className="inline-flex items-center gap-1.5">
                <Settings2 size={12} /> Numeração de senhas
              </span>
              {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {advancedOpen && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1 block">
                    Prefixo normal
                  </label>
                  <input
                    type="text"
                    value={numbering.ticketPrefixNormal}
                    onChange={e => setNumbering({ ...numbering, ticketPrefixNormal: e.target.value.slice(0, 5) })}
                    maxLength={5}
                    placeholder="R"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1 block">
                    Prefixo prioridade
                  </label>
                  <input
                    type="text"
                    value={numbering.ticketPrefixPriority}
                    onChange={e => setNumbering({ ...numbering, ticketPrefixPriority: e.target.value.slice(0, 5) })}
                    maxLength={5}
                    placeholder="P"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1 block">
                    Reset do contador
                  </label>
                  <select
                    value={numbering.resetStrategy}
                    onChange={e => setNumbering({ ...numbering, resetStrategy: e.target.value as ResetStrategy })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {(Object.keys(RESET_LABELS) as ResetStrategy[]).map(k => (
                      <option key={k} value={k}>{RESET_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1 block">
                    Dígitos (1-6)
                  </label>
                  <input
                    type="number"
                    min={1} max={6}
                    value={numbering.numberPadding}
                    onChange={e => setNumbering({ ...numbering, numberPadding: Math.max(1, Math.min(6, Number(e.target.value) || 3)) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-slate-500">
                    Exemplo: {numbering.ticketPrefixNormal.toUpperCase() || 'R'}-
                    {'0'.repeat(Math.max(0, numbering.numberPadding - 1))}1 ·{' '}
                    {numbering.ticketPrefixPriority.toUpperCase() || 'P'}-
                    {'0'.repeat(Math.max(0, numbering.numberPadding - 1))}1
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {totem ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CaptureCheckbox({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
      />
      {label}
    </label>
  )
}
