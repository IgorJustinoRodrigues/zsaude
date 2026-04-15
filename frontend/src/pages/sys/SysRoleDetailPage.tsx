import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, Edit2, X, Shield } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { PermissionMatrix } from '../../components/shared/PermissionMatrix'
import {
  rolesAdminApi,
  type RoleDetail,
  type RolePermissionState,
} from '../../api/roles'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

export function SysRoleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [role, setRole] = useState<RoleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Estados editáveis
  const [nameDraft, setNameDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [overrides, setOverrides] = useState<Record<string, RolePermissionState>>({})

  const load = () => {
    if (!id) return
    setLoading(true)
    rolesAdminApi.get(id)
      .then(r => {
        setRole(r)
        setNameDraft(r.name)
        setDescDraft(r.description ?? '')
        setOverrides({})
      })
      .catch(e => setError(e instanceof HttpError ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id]) // eslint-disable-line

  const hasDirty = useMemo(() => {
    if (!role) return false
    return (
      nameDraft !== role.name ||
      descDraft !== (role.description ?? '') ||
      Object.keys(overrides).length > 0
    )
  }, [role, nameDraft, descDraft, overrides])

  const entries = useMemo(() => {
    if (!role) return []
    if (!editing) return role.permissions
    return role.permissions.map(p => ({
      ...p,
      state: overrides[p.code] ?? p.state,
    }))
  }, [role, editing, overrides])

  const handleMatrixChange = (code: string, state: RolePermissionState) => {
    const original = role?.permissions.find(p => p.code === code)?.state
    setOverrides(prev => {
      const next = { ...prev }
      if (state === original) {
        delete next[code]
      } else {
        next[code] = state
      }
      return next
    })
  }

  const cancel = () => {
    if (!role) return
    setNameDraft(role.name)
    setDescDraft(role.description ?? '')
    setOverrides({})
    setEditing(false)
  }

  const save = async () => {
    if (!role) return
    setSaving(true)
    try {
      let updated = role

      // 1. Atualiza metadados se mudaram
      if (nameDraft !== role.name || descDraft !== (role.description ?? '')) {
        updated = await rolesAdminApi.update(role.id, {
          name: nameDraft,
          description: descDraft || null,
        })
      }

      // 2. Atualiza permissões se houver overrides
      if (Object.keys(overrides).length > 0) {
        const payload = Object.entries(overrides).map(([code, state]) => ({ code, state }))
        updated = await rolesAdminApi.setPermissions(role.id, { permissions: payload })
      }

      setRole(updated)
      setNameDraft(updated.name)
      setDescDraft(updated.description ?? '')
      setOverrides({})
      setEditing(false)
      toast.success('Perfil atualizado', updated.name)
    } catch (e) {
      toast.error('Falha ao salvar', e instanceof HttpError ? e.message : 'Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-20 text-muted-foreground">Carregando…</div>
  if (error) return <div className="text-center py-20 text-red-600">{error}</div>
  if (!role) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title={role.name}
        subtitle={`${role.code} · ${role.scope}${role.parent ? ` · herda de ${role.parent.name}` : ''}`}
        back="/sys/perfis"
        actions={
          editing ? (
            <>
              <button
                onClick={cancel}
                disabled={saving}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
              >
                <X size={15} /> Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !hasDirty}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={15} /> {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              <Edit2 size={15} /> Editar
            </button>
          )
        }
      />

      {/* Card de metadados */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
            <Shield size={22} />
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetaField label="Nome">
              {editing ? (
                <input
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  className="w-full px-2 py-1 border border-border rounded text-sm"
                />
              ) : role.name}
            </MetaField>
            <MetaField label="Código"><span className="font-mono text-xs">{role.code}</span></MetaField>
            <MetaField label="Escopo">
              <span className={cn(
                'inline-block text-xs px-2 py-0.5 rounded font-medium',
                role.scope === 'SYSTEM' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700',
              )}>
                {role.scope}
              </span>
            </MetaField>
            <MetaField label="Herda de">{role.parent?.name ?? '—'}</MetaField>
            <div className="col-span-2 md:col-span-4">
              <MetaField label="Descrição">
                {editing ? (
                  <textarea
                    value={descDraft}
                    onChange={e => setDescDraft(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 border border-border rounded text-sm"
                  />
                ) : (role.description || '—')}
              </MetaField>
            </div>
          </div>
        </div>
      </div>

      {/* Matriz */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Permissões</h2>
          {role.isSystemBase && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              Editando permissões de perfil base — afeta todos os municípios.
            </span>
          )}
        </div>
        <PermissionMatrix
          entries={entries}
          editable={editing}
          onChange={handleMatrixChange}
        />
      </div>
    </div>
  )
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm mt-0.5">{children}</div>
    </div>
  )
}
