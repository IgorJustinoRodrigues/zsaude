// Tela MASTER de setores — município ou unidade.
//
// - Município: lista editável direto (defaults do sistema foram seeded
//   ao criar o município).
// - Unidade: se ``custom_sectors=false`` mostra "Seguindo o município"
//   + botão "Personalizar esta unidade" (clona a lista e desbloqueia).
//   Se ``true`` a lista é própria + botão "Voltar a herdar" (apaga tudo
//   e volta a seguir o município).

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArchiveRestore, Archive, Check, Edit3, GripVertical, LayoutList,
  Loader2, Plus, RotateCcw, Trash2, X,
} from 'lucide-react'
import { sectorsAdminApi, type Sector } from '../../api/sectors'
import { directoryApi, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { confirmDialog } from '../../store/dialogStore'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ScopeHeader, useScopeHeader } from './SysModulesConfigPages'

type Scope = 'municipality' | 'facility'

export function SysMunicipalitySectorsPage() {
  return <SectorsPage scope="municipality" />
}

export function SysFacilitySectorsPage() {
  return <SectorsPage scope="facility" />
}

function SectorsPage({ scope }: { scope: Scope }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { title, subtitle, loading: loadingHeader } = useScopeHeader(scope, id)

  const [loading, setLoading] = useState(true)
  const [sectors, setSectors] = useState<Sector[]>([])
  const [busy, setBusy] = useState(false)
  // Só pra facility — se a unidade já tem sua lista personalizada.
  const [facilityUsesCustom, setFacilityUsesCustom] = useState(false)
  // Só pra facility em modo "follow" — lista herdada do município, em
  // modo leitura.
  const [inheritedSectors, setInheritedSectors] = useState<Sector[]>([])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      if (scope === 'municipality') {
        const list = await sectorsAdminApi.listMunicipality(id)
        setSectors(list)
        setInheritedSectors([])
        setFacilityUsesCustom(true)  // município sempre "edita direto"
      } else {
        const all = await directoryApi.listFacilities(undefined, 'all')
        const fac = all.find((f: FacilityDto) => f.id === id)
        if (!fac) throw new Error('Unidade não encontrada')
        const [own, fromMun] = await Promise.all([
          sectorsAdminApi.listFacility(id),
          sectorsAdminApi.listMunicipality(fac.municipalityId),
        ])
        setSectors(own)
        setFacilityUsesCustom(own.length > 0)
        setInheritedSectors(fromMun.filter(s => !s.archived))
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
    scope === 'municipality'
      ? `/sys/municipios/${id}/recursos`
      : `/sys/unidades/${id}/recursos`

  const active = sectors.filter(s => !s.archived)
  const archived = sectors.filter(s => s.archived)

  // ── Ações ─────────────────────────────────────────────────────────

  const createApi =
    scope === 'municipality'
      ? (payload: { name: string; abbreviation: string }) => sectorsAdminApi.createMunicipality(id, payload)
      : (payload: { name: string; abbreviation: string }) => sectorsAdminApi.createFacility(id, payload)

  const reorderApi =
    scope === 'municipality'
      ? (ids: string[]) => sectorsAdminApi.reorderMunicipality(id, ids)
      : (ids: string[]) => sectorsAdminApi.reorderFacility(id, ids)

  async function doAction<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha.'
      toast.error('Erro', msg)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(name: string, abbreviation: string) {
    const res = await doAction(() => createApi({ name, abbreviation }))
    if (res) { toast.success('Setor criado'); await load() }
  }

  async function handleUpdate(sectorId: string, patch: { name?: string; abbreviation?: string }) {
    const res = await doAction(() => sectorsAdminApi.update(sectorId, patch))
    if (res) { toast.success('Setor atualizado'); await load() }
  }

  async function handleArchiveToggle(s: Sector) {
    const res = await doAction(() => sectorsAdminApi.update(s.id, { archived: !s.archived }))
    if (res) { await load() }
  }

  async function handleDelete(s: Sector) {
    const ok = await confirmDialog({
      title: 'Excluir setor',
      message: `O setor "${s.name}" será removido definitivamente. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    const res = await doAction(() => sectorsAdminApi.remove(s.id))
    if (res !== null) { toast.success('Setor excluído'); await load() }
  }

  // Reordenação via drag & drop.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  async function commitDrop(from: number, insertAt: number) {
    // No-op: soltar no mesmo lugar ou "logo acima/abaixo de si mesmo".
    if (insertAt === from || insertAt === from + 1) return
    const ids = active.map(s => s.id)
    const [moved] = ids.splice(from, 1)
    // Depois do remove, índices após ``from`` se deslocam 1 pra trás.
    const adjusted = insertAt > from ? insertAt - 1 : insertAt
    ids.splice(adjusted, 0, moved)
    const res = await doAction(() => reorderApi(ids))
    if (res) setSectors(applyReorder(sectors, res))
  }

  async function customize() {
    const ok = await confirmDialog({
      title: 'Personalizar setores desta unidade',
      message:
        `A lista atual (${inheritedSectors.length} setor${inheritedSectors.length === 1 ? '' : 'es'}) do município será clonada pra esta unidade, ` +
        `e a partir daí você pode editar livremente sem afetar outras unidades. ` +
        `Pra voltar a seguir o município depois, basta clicar em "Voltar a herdar".`,
      confirmLabel: 'Personalizar',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    const res = await doAction(() => sectorsAdminApi.customizeFacility(id))
    if (res) { toast.success('Setores clonados do município'); await load() }
  }

  async function uncustomize() {
    const ok = await confirmDialog({
      title: 'Voltar a herdar do município',
      message: 'Os setores próprios desta unidade serão apagados e a unidade passará a usar a lista do município. Essa ação não pode ser desfeita.',
      confirmLabel: 'Voltar a herdar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    const res = await doAction(() => sectorsAdminApi.uncustomizeFacility(id))
    if (res) { toast.success('Voltou a herdar'); await load() }
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
            <LayoutList size={11} /> Recursos · Setores
          </span>
        }
        onBack={() => navigate(sectionsHref)}
      />

      {/* Aviso + ações de cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-1 min-w-[200px]">
          {scope === 'municipality'
            ? 'Estes setores são a base usada pelas unidades deste município. Cada unidade pode personalizar sua própria lista — partindo dessa.'
            : facilityUsesCustom
              ? 'Esta unidade tem uma lista própria. Alterações aqui não afetam outras unidades.'
              : 'Esta unidade segue os setores do município. Clique em "Personalizar" para criar uma lista própria (clona do município).'
          }
        </p>
        {scope === 'facility' && !loading && (
          <div className="shrink-0">
            {facilityUsesCustom ? (
              <button
                type="button"
                disabled={busy}
                onClick={uncustomize}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={14} />
                Voltar a herdar
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={customize}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
              >
                Personalizar esta unidade
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="text-slate-400 animate-spin" />
        </div>
      ) : scope === 'facility' && !facilityUsesCustom ? (
        <InheritedSectorsList sectors={inheritedSectors} />
      ) : (
        <>
          {/* Lista drag & drop.
              ``dropIndex`` é a posição de INSERÇÃO na lista nova (0..N);
              ex.: ``dropIndex=2`` significa "cai entre o item 1 e o item 2".
              A barra verde é renderizada ACIMA do row de índice ``dropIndex``
              (ou no final quando ``dropIndex === active.length``). */}
          <ul
            className="space-y-2"
            onDragOver={e => {
              // Quando o cursor está fora de qualquer row mas ainda dentro
              // da ul (gap entre linhas ou fim da lista), mantém o último
              // dropIndex calculado — evita flicker.
              if (dragIndex === null) return
              e.preventDefault()
            }}
            onDrop={async () => {
              if (dragIndex === null || dropIndex === null) {
                setDragIndex(null); setDropIndex(null); return
              }
              const from = dragIndex
              const to = dropIndex
              setDragIndex(null)
              setDropIndex(null)
              await commitDrop(from, to)
            }}
          >
            {active.map((s, i) => (
              <SectorRow
                key={s.id}
                sector={s}
                index={i}
                busy={busy}
                isDragging={dragIndex === i}
                showDropLineAbove={dropIndex === i && dragIndex !== null}
                showDropLineBelow={
                  // Última linha: mostra a barra embaixo quando dropIndex == length
                  i === active.length - 1 && dropIndex === active.length && dragIndex !== null
                }
                onDragStart={() => setDragIndex(i)}
                onComputeDropIndex={position => {
                  // ``position`` é 'above' ou 'below' — traduz pra índice.
                  const target = position === 'above' ? i : i + 1
                  if (dropIndex !== target) setDropIndex(target)
                }}
                onDragEnd={() => { setDragIndex(null); setDropIndex(null) }}
                onUpdate={patch => handleUpdate(s.id, patch)}
                onArchive={() => handleArchiveToggle(s)}
                onDelete={() => handleDelete(s)}
              />
            ))}
          </ul>

          {/* Criar novo */}
          <CreateSectorForm onCreate={handleCreate} disabled={busy} />

          {/* Arquivados */}
          {archived.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Arquivados
              </h3>
              <ul className="space-y-1.5">
                {archived.map(s => (
                  <li
                    key={s.id}
                    className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 flex items-center gap-3 opacity-70"
                  >
                    <span className="text-xs font-mono bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 shrink-0">
                      {s.abbreviation || '—'}
                    </span>
                    <span className="flex-1 text-sm truncate">{s.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleArchiveToggle(s)}
                      title="Desarquivar"
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(s)}
                      title="Excluir definitivamente"
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
    </div>
  )
}

// ─── Lista dos setores herdados (read-only) ──────────────────────────────────

function InheritedSectorsList({ sectors }: { sectors: Sector[] }) {
  if (sectors.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
        O município ainda não tem setores cadastrados.
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Setores do município ({sectors.length})
        </p>
        <span className="text-[11px] text-slate-400">somente leitura · herdado</span>
      </div>
      <ul className="space-y-1.5">
        {sectors.map(s => (
          <li
            key={s.id}
            className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 flex items-center gap-3"
          >
            <span className="text-xs font-mono bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 shrink-0 min-w-[3rem] text-center">
              {s.abbreviation || '—'}
            </span>
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">
              {s.name}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
        Pra editar esta lista nesta unidade, clique em <strong>Personalizar esta unidade</strong> acima —
        a lista será clonada e você poderá modificar livremente.
      </p>
    </div>
  )
}

// ─── Linha editável ──────────────────────────────────────────────────────────

interface RowProps {
  sector: Sector
  index: number
  busy: boolean
  isDragging: boolean
  showDropLineAbove: boolean
  showDropLineBelow: boolean
  onDragStart: () => void
  /** Decide "acima" ou "abaixo" pela posição do mouse em relação ao meio da linha. */
  onComputeDropIndex: (position: 'above' | 'below') => void
  onDragEnd: () => void
  onUpdate: (patch: { name?: string; abbreviation?: string }) => void
  onArchive: () => void
  onDelete: () => void
}

function SectorRow({
  sector, index, busy, isDragging, showDropLineAbove, showDropLineBelow,
  onDragStart, onComputeDropIndex, onDragEnd,
  onUpdate, onArchive, onDelete,
}: RowProps) {
  // ``index`` usado pra desabilitar onMouseDown em modo edit (não
  // intencional). Silencia warning do TS.
  void index
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(sector.name)
  const [abbr, setAbbr] = useState(sector.abbreviation)
  // Só deixamos `draggable` ativo quando o usuário segura no handle —
  // evita que clicar em um input dispare o drag acidentalmente.
  const [dragArmed, setDragArmed] = useState(false)

  function save() {
    const patch: { name?: string; abbreviation?: string } = {}
    if (name !== sector.name) patch.name = name
    if (abbr !== sector.abbreviation) patch.abbreviation = abbr
    if (Object.keys(patch).length > 0) onUpdate(patch)
    setEditing(false)
  }
  function cancel() {
    setName(sector.name)
    setAbbr(sector.abbreviation)
    setEditing(false)
  }

  return (
    <li
      draggable={dragArmed && !editing}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        // Necessário em Firefox pra o drag rolar.
        e.dataTransfer.setData('text/plain', sector.id)
        onDragStart()
      }}
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        // Decide "acima" ou "abaixo" pelo Y do mouse em relação ao centro da row.
        const rect = e.currentTarget.getBoundingClientRect()
        const midY = rect.top + rect.height / 2
        onComputeDropIndex(e.clientY < midY ? 'above' : 'below')
      }}
      onDragEnd={() => { setDragArmed(false); onDragEnd() }}
      className={cn(
        'relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 flex items-center gap-3 transition-opacity',
        isDragging && 'opacity-40',
      )}
    >
      {/* Indicadores de drop */}
      {showDropLineAbove && (
        <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-teal-500 rounded-full pointer-events-none" />
      )}
      {showDropLineBelow && (
        <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-teal-500 rounded-full pointer-events-none" />
      )}

      {/* Handle de drag */}
      <button
        type="button"
        disabled={busy || editing}
        onMouseDown={() => setDragArmed(true)}
        onTouchStart={() => setDragArmed(true)}
        title="Arraste pra reordenar"
        className={cn(
          'p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0',
          'cursor-grab active:cursor-grabbing disabled:cursor-default disabled:opacity-40',
        )}
      >
        <GripVertical size={14} />
      </button>

      {editing ? (
        <>
          <input
            type="text"
            value={abbr}
            onChange={e => setAbbr(e.target.value.toUpperCase())}
            placeholder="SIGLA"
            maxLength={20}
            className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nome do setor"
            maxLength={120}
            className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            autoFocus
          />
          <button type="button" onClick={save} disabled={busy} className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Salvar">
            <Check size={14} />
          </button>
          <button type="button" onClick={cancel} disabled={busy} className="p-1.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cancelar">
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 shrink-0 min-w-[3rem] text-center">
            {sector.abbreviation || '—'}
          </span>
          <span className="flex-1 text-sm truncate">{sector.name}</span>
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar">
            <Edit3 size={14} />
          </button>
          <button type="button" onClick={onArchive} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40" title="Arquivar">
            <Archive size={14} />
          </button>
          <button type="button" onClick={onDelete} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" title="Excluir">
            <Trash2 size={14} />
          </button>
        </>
      )}
    </li>
  )
}

// ─── Form de criação ─────────────────────────────────────────────────────────

function CreateSectorForm({
  onCreate, disabled,
}: {
  onCreate: (name: string, abbreviation: string) => void | Promise<void>
  disabled: boolean
}) {
  const [name, setName] = useState('')
  const [abbr, setAbbr] = useState('')

  function submit() {
    if (!name.trim()) return
    void onCreate(name.trim(), abbr.trim())
    setName('')
    setAbbr('')
  }

  return (
    <div className="mt-4 bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 flex items-center gap-3">
      <div className="w-[22px]" /> {/* alinha com o handle de drag */}
      <input
        type="text"
        value={abbr}
        onChange={e => setAbbr(e.target.value.toUpperCase())}
        placeholder="SIGLA"
        maxLength={20}
        disabled={disabled}
        className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Novo setor…"
        maxLength={120}
        disabled={disabled}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !name.trim()}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Plus size={13} />
        Adicionar
      </button>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Aplica a resposta do reorder mantendo arquivados no fim. O backend
 *  retorna só não-arquivados, já na nova ordem. */
function applyReorder(prev: Sector[], reorderedActive: Sector[]): Sector[] {
  const activeIds = new Set(reorderedActive.map(s => s.id))
  const archived = prev.filter(s => !activeIds.has(s.id))
  return [...reorderedActive, ...archived]
}
void Loader2 // usado no spinner de loading; mantido como import
