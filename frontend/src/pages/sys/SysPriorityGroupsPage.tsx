// Tela MASTER de grupos prioritários — recurso por município.
//
// Grupos prioritários (Lei 10.048/2000, 10.741/2003) saem com seed padrão
// (Gestante, Idoso ≥60, PCD, Criança de colo). Município pode adicionar
// outros (ex.: lactante, doador de sangue), arquivar o que não usa, ou
// renomear. Lista é consumida pelo select da triagem (Fase C).

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Archive, ArchiveRestore, Check, Edit3, Loader2, Plus, Shield,
  Trash2, X,
} from 'lucide-react'
import { clnApi, type PriorityGroup } from '../../api/cln'
import { HttpError } from '../../api/client'
import { confirmDialog } from '../../store/dialogStore'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ScopeHeader, useScopeHeader } from './SysModulesConfigPages'

export function SysPriorityGroupsPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { title, subtitle, loading: loadingHeader } = useScopeHeader('municipality', id)

  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<PriorityGroup[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const list = await clnApi.admin.listPriorityGroups(id, true)
      setGroups(list)
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao carregar.'
      toast.error('Erro', msg)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  if (!id) return <div className="text-sm text-red-500">Identificador inválido.</div>

  const active = groups.filter(g => !g.archived)
  const archived = groups.filter(g => g.archived)

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

  async function handleCreate(name: string, description: string) {
    if (!id) return
    const res = await doAction(() =>
      clnApi.admin.createPriorityGroup(id, {
        name, description, displayOrder: (active.length + 1) * 10,
      }),
    )
    if (res) { toast.success('Grupo criado'); await load() }
  }

  async function handleUpdate(
    groupId: string, patch: Partial<Pick<PriorityGroup, 'name' | 'description' | 'archived'>>,
  ) {
    if (!id) return
    const res = await doAction(() => clnApi.admin.updatePriorityGroup(id, groupId, patch))
    if (res) { toast.success('Grupo atualizado'); await load() }
  }

  async function handleArchiveToggle(g: PriorityGroup) {
    if (!id) return
    const res = await doAction(() =>
      clnApi.admin.updatePriorityGroup(id, g.id, { archived: !g.archived }),
    )
    if (res) { await load() }
  }

  async function handleDelete(g: PriorityGroup) {
    if (!id) return
    const ok = await confirmDialog({
      title: 'Excluir grupo prioritário',
      message:
        `O grupo "${g.name}" será removido definitivamente. ` +
        'Se estiver em uso em algum atendimento, use arquivar.',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    const res = await doAction(() => clnApi.admin.deletePriorityGroup(id, g.id))
    if (res !== null) { toast.success('Grupo excluído'); await load() }
  }

  return (
    <div className="space-y-5">
      <ScopeHeader
        scope="municipality"
        loading={loadingHeader}
        title={title}
        subtitle={subtitle}
        breadcrumb={
          <span className="flex items-center gap-1 text-rose-600 font-medium">
            <Shield size={11} /> Recursos · Grupos prioritários
          </span>
        }
        onBack={() => navigate(`/sys/municipios/${id}/recursos`)}
      />

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Grupos usados pela triagem pra marcar prioridade legal. O município
        pode adicionar outros além dos 4 do seed e arquivar os que não usa.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="text-slate-400 animate-spin" />
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {active.map(g => (
              <GroupRow
                key={g.id}
                group={g}
                busy={busy}
                onUpdate={patch => handleUpdate(g.id, patch)}
                onArchive={() => handleArchiveToggle(g)}
                onDelete={() => handleDelete(g)}
              />
            ))}
          </ul>

          <CreateGroupForm onCreate={handleCreate} disabled={busy} />

          {archived.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Arquivados
              </h3>
              <ul className="space-y-1.5">
                {archived.map(g => (
                  <li
                    key={g.id}
                    className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 flex items-center gap-3 opacity-70"
                  >
                    <span className="flex-1 text-sm truncate">{g.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleArchiveToggle(g)}
                      title="Desarquivar"
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(g)}
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

interface RowProps {
  group: PriorityGroup
  busy: boolean
  onUpdate: (patch: { name?: string; description?: string }) => void
  onArchive: () => void
  onDelete: () => void
}

function GroupRow({ group, busy, onUpdate, onArchive, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description)

  function save() {
    const patch: { name?: string; description?: string } = {}
    if (name !== group.name) patch.name = name
    if (description !== group.description) patch.description = description
    if (Object.keys(patch).length > 0) onUpdate(patch)
    setEditing(false)
  }
  function cancel() {
    setName(group.name)
    setDescription(group.description)
    setEditing(false)
  }

  return (
    <li
      className={cn(
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5',
      )}
    >
      {editing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nome do grupo"
            maxLength={80}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
            autoFocus
          />
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descrição (opcional)"
            maxLength={300}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          />
          <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={save} disabled={busy} className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Salvar">
              <Check size={14} />
            </button>
            <button type="button" onClick={cancel} disabled={busy} className="p-1.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cancelar">
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Shield size={14} className="text-rose-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{group.name}</p>
            {group.description.trim() && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {group.description}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar">
            <Edit3 size={14} />
          </button>
          <button type="button" onClick={onArchive} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40" title="Arquivar">
            <Archive size={14} />
          </button>
          <button type="button" onClick={onDelete} disabled={busy} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" title="Excluir">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </li>
  )
}

function CreateGroupForm({
  onCreate, disabled,
}: {
  onCreate: (name: string, description: string) => void | Promise<void>
  disabled: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  function submit() {
    if (!name.trim()) return
    void onCreate(name.trim(), description.trim())
    setName('')
    setDescription('')
  }

  return (
    <div className="mt-4 bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 space-y-2">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Novo grupo (ex.: Lactante)"
        maxLength={80}
        disabled={disabled}
        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
      />
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descrição (opcional)"
          maxLength={300}
          disabled={disabled}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          className="flex-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !name.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={13} />
          Adicionar
        </button>
      </div>
    </div>
  )
}
