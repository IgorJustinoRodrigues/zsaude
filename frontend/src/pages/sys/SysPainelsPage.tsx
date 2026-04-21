// Tela MASTER de painéis lógicos — município ou unidade.
//
// - Município: lista editável (templates).
// - Unidade: painéis próprios + seção "Herdados do município"
//   (read-only, com badge). Criar/editar só no escopo próprio.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Archive, ArchiveRestore, BellRing, Edit3, Loader2, Plus, Trash2,
  Volume2, VolumeX, X,
} from 'lucide-react'
import {
  painelsAdminApi,
  type Painel,
  type PainelMode,
} from '../../api/painels'
import { sectorsAdminApi, type Sector } from '../../api/sectors'
import { directoryApi, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { confirmDialog } from '../../store/dialogStore'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ScopeHeader, useScopeHeader } from './SysModulesConfigPages'

type Scope = 'municipality' | 'facility'

export function SysMunicipalityPainelsPage() {
  return <PainelsPage scope="municipality" />
}

export function SysFacilityPainelsPage() {
  return <PainelsPage scope="facility" />
}

function PainelsPage({ scope }: { scope: Scope }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { title, subtitle, loading: loadingHeader } = useScopeHeader(scope, id)

  const [loading, setLoading] = useState(true)
  const [own, setOwn] = useState<Painel[]>([])
  // Só pra facility: painéis herdados do município (read-only aqui).
  const [inherited, setInherited] = useState<Painel[]>([])
  // Lista de setores efetivos pra oferecer no form (escopo atual).
  const [sectorOptions, setSectorOptions] = useState<Sector[]>([])
  const [editing, setEditing] = useState<Painel | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      if (scope === 'municipality') {
        const [list, sectors] = await Promise.all([
          painelsAdminApi.listMunicipality(id),
          sectorsAdminApi.listMunicipality(id),
        ])
        setOwn(list)
        setInherited([])
        setSectorOptions(sectors.filter(s => !s.archived))
      } else {
        const all = await directoryApi.listFacilities(undefined, 'all')
        const fac = all.find((f: FacilityDto) => f.id === id)
        if (!fac) throw new Error('Unidade não encontrada')
        const [ownList, munList, ownSectors, munSectors] = await Promise.all([
          painelsAdminApi.listFacility(id),
          painelsAdminApi.listMunicipality(fac.municipalityId),
          sectorsAdminApi.listFacility(id),
          sectorsAdminApi.listMunicipality(fac.municipalityId),
        ])
        setOwn(ownList)
        setInherited(munList.filter(p => !p.archived))
        // Se a unidade tem setores próprios, usa; senão usa o município.
        const effective = ownSectors.length > 0 ? ownSectors : munSectors
        setSectorOptions(effective.filter(s => !s.archived))
      }
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao carregar.'
      toast.error('Erro', msg)
    } finally {
      setLoading(false)
    }
  }, [id, scope])

  useEffect(() => { void load() }, [load])

  if (!id) return <div className="text-sm text-red-500">Identificador inválido.</div>

  const sectionsHref =
    scope === 'municipality' ? `/sys/municipios/${id}/recursos` : `/sys/unidades/${id}/recursos`

  const active = own.filter(p => !p.archived)
  const archived = own.filter(p => p.archived)

  async function doAction<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    try { return await fn() }
    catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha.'
      toast.error('Erro', msg)
      return null
    } finally { setBusy(false) }
  }

  async function handleArchiveToggle(p: Painel) {
    const res = await doAction(() => painelsAdminApi.update(p.id, { archived: !p.archived }))
    if (res) await load()
  }

  async function handleDelete(p: Painel) {
    const ok = await confirmDialog({
      title: 'Excluir painel',
      message: `O painel "${p.name}" será removido definitivamente. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    const res = await doAction(() => painelsAdminApi.remove(p.id))
    if (res !== null) { toast.success('Painel excluído'); await load() }
  }

  async function handleSave(
    existing: Painel | null,
    data: { name: string; mode: PainelMode; announceAudio: boolean; sectorNames: string[] },
  ) {
    if (existing) {
      const res = await doAction(() => painelsAdminApi.update(existing.id, data))
      if (res) { toast.success('Painel atualizado'); setEditing(null); await load() }
    } else {
      const create = scope === 'municipality'
        ? () => painelsAdminApi.createMunicipality(id!, data)
        : () => painelsAdminApi.createFacility(id!, data)
      const res = await doAction(create)
      if (res) { toast.success('Painel criado'); setCreating(false); await load() }
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
            <BellRing size={11} /> Recursos · Painéis de chamada
          </span>
        }
        onBack={() => navigate(sectionsHref)}
      />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-1 min-w-[200px]">
          {scope === 'municipality'
            ? 'Templates do município. Todas as unidades veem estes painéis; cada unidade pode também criar os próprios.'
            : 'Painéis desta unidade + templates herdados do município. Dispositivos físicos (TVs) são vinculados a um painel no pareamento.'
          }
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={busy || loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <Plus size={14} /> Novo painel
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="text-slate-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Próprios */}
          {active.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                {scope === 'municipality' ? 'Painéis' : `Próprios desta unidade (${active.length})`}
              </h3>
              <ul className="space-y-2">
                {active.map(p => (
                  <PainelRow
                    key={p.id}
                    painel={p}
                    busy={busy}
                    onEdit={() => setEditing(p)}
                    onArchive={() => handleArchiveToggle(p)}
                    onDelete={() => handleDelete(p)}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
              {scope === 'municipality'
                ? 'Nenhum painel configurado. Crie o primeiro template acima.'
                : 'Esta unidade não tem painéis próprios. Use os herdados abaixo ou crie um novo.'
              }
            </div>
          )}

          {/* Herdados (só facility) */}
          {scope === 'facility' && inherited.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Herdados do município ({inherited.length})
                </h3>
                <span className="text-[11px] text-slate-400">somente leitura</span>
              </div>
              <ul className="space-y-1.5">
                {inherited.map(p => (
                  <li
                    key={p.id}
                    className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 flex items-center gap-3"
                  >
                    <PainelBadge mode={p.mode} audio={p.announceAudio} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {summarizeSectors(p.sectorNames)}
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

          {/* Arquivados */}
          {archived.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Arquivados ({archived.length})
              </h3>
              <ul className="space-y-1.5">
                {archived.map(p => (
                  <li
                    key={p.id}
                    className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 flex items-center gap-3 opacity-70"
                  >
                    <span className="flex-1 text-sm truncate">{p.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleArchiveToggle(p)}
                      title="Desarquivar"
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(p)}
                      title="Excluir"
                      className="p-1.5 rounded text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Modal criar/editar */}
      {(creating || editing) && (
        <PainelModal
          painel={editing}
          sectorOptions={sectorOptions}
          busy={busy}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSave={data => handleSave(editing, data)}
        />
      )}
    </div>
  )
}

// ─── Linha de painel ─────────────────────────────────────────────────────────

interface RowProps {
  painel: Painel
  busy: boolean
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}

function PainelRow({ painel, busy, onEdit, onArchive, onDelete }: RowProps) {
  return (
    <li className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 flex items-center gap-3">
      <PainelBadge mode={painel.mode} audio={painel.announceAudio} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{painel.name}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {summarizeSectors(painel.sectorNames)}
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

function PainelBadge({ mode, audio }: { mode: PainelMode; audio: boolean }) {
  const label = mode === 'senha' ? 'SENHA' : mode === 'nome' ? 'NOME' : 'AMBOS'
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-[10px] font-mono bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded uppercase tracking-wider">
        {label}
      </span>
      <span className={cn('p-0.5 rounded', audio ? 'text-teal-600' : 'text-slate-400')} title={audio ? 'Áudio ligado' : 'Áudio desligado'}>
        {audio ? <Volume2 size={12} /> : <VolumeX size={12} />}
      </span>
    </div>
  )
}

function summarizeSectors(names: string[]): string {
  if (names.length === 0) return 'Todos os setores'
  if (names.length <= 3) return names.join(' · ')
  return `${names.slice(0, 3).join(' · ')} · +${names.length - 3}`
}

// ─── Modal criar/editar ──────────────────────────────────────────────────────

interface ModalProps {
  painel: Painel | null
  sectorOptions: Sector[]
  busy: boolean
  onClose: () => void
  onSave: (data: {
    name: string; mode: PainelMode; announceAudio: boolean; sectorNames: string[]
  }) => void
}

function PainelModal({ painel, sectorOptions, busy, onClose, onSave }: ModalProps) {
  const [name, setName] = useState(painel?.name ?? '')
  const [mode, setMode] = useState<PainelMode>(painel?.mode ?? 'senha')
  const [audio, setAudio] = useState(painel?.announceAudio ?? true)
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(
    new Set(painel?.sectorNames ?? []),
  )

  const toggleSector = (n: string) => {
    setSelectedSectors(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  const canSave = name.trim().length > 0 && !busy

  function submit() {
    if (!canSave) return
    onSave({
      name: name.trim(),
      mode,
      announceAudio: audio,
      sectorNames: [...selectedSectors],
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-sm font-semibold">{painel ? 'Editar painel' : 'Novo painel'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Painel Emergência"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 block">
              Chamar por
            </label>
            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(['senha', 'nome', 'ambos'] as PainelMode[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                    mode === m
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={audio}
                onChange={e => setAudio(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
              />
              Anunciar por áudio (voz sintetizada)
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 block">
              Setores exibidos
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Nenhum marcado = exibe qualquer chamada. Marque pra filtrar apenas os setores escolhidos.
            </p>
            {sectorOptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Este escopo não tem setores cadastrados.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 border border-slate-200 dark:border-slate-800 rounded-lg p-2">
                {sectorOptions.map(s => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-200 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSectors.has(s.name)}
                      onChange={() => toggleSector(s.name)}
                      className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-500 shrink-0 min-w-[2.5rem] text-center">
                      {s.abbreviation || '—'}
                    </span>
                    <span className="truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 shrink-0">
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
            {painel ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}
