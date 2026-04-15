import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, X, Shield, User as UserIcon, Building2 } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { PermissionMatrix } from '../../components/shared/PermissionMatrix'
import {
  rolesApi,
  type AccessPermissionEntry,
  type AccessPermissionsDetail,
  type RolePermissionEntry,
  type RolePermissionState,
} from '../../api/roles'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'

/**
 * Personaliza permissões de um acesso específico (user X @ unidade Y),
 * sem mexer no perfil. Lê contexto da URL: /ops/usuarios/:userId/acessos/:accessId/permissoes.
 */
export function OpsUserAccessPermsPage() {
  const { userId, accessId } = useParams<{ userId: string; accessId: string }>()
  const navigate = useNavigate()
  const can = useAuthStore(s => s.can)
  const canEdit = can('roles.override.manage')

  const [detail, setDetail] = useState<AccessPermissionsDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, RolePermissionState>>({})

  const load = () => {
    if (!userId || !accessId) return
    setLoading(true)
    rolesApi.getAccessPermissions(userId, accessId)
      .then(d => { setDetail(d); setOverrides({}) })
      .catch(e => setError(e instanceof HttpError ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [userId, accessId]) // eslint-disable-line

  const entries = useMemo<RolePermissionEntry[]>(() => {
    if (!detail) return []
    return detail.permissions.map(p => accessToMatrixEntry(p, editing ? overrides[p.code] : undefined))
  }, [detail, overrides, editing])

  const hasDirty = Object.keys(overrides).length > 0

  const handleChange = (code: string, state: RolePermissionState) => {
    const original = detail?.permissions.find(p => p.code === code)?.state
    setOverrides(prev => {
      const next = { ...prev }
      if (state === original) delete next[code]; else next[code] = state
      return next
    })
  }

  const cancel = () => { setOverrides({}); setEditing(false) }

  const save = async () => {
    if (!detail || !userId || !accessId || !hasDirty) return
    setSaving(true)
    try {
      const payload = Object.entries(overrides).map(([code, state]) => ({ code, state }))
      const updated = await rolesApi.setAccessPermissions(userId, accessId, { permissions: payload })
      setDetail(updated)
      setOverrides({})
      setEditing(false)
      toast.success('Permissões personalizadas', `${updated.userName} @ ${updated.facilityName}`)
    } catch (e) {
      toast.error('Falha ao salvar', e instanceof HttpError ? e.message : 'Tente novamente.')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-20 text-muted-foreground">Carregando…</div>
  if (error) return <div className="text-center py-20 text-red-600">{error}</div>
  if (!detail) return null

  return (
    <div>
      <PageHeader
        title="Personalizar permissões"
        subtitle={`${detail.userName} · ${detail.facilityName}`}
        back={`/ops/usuarios/${userId}`}
        actions={
          editing ? (
            <>
              <button onClick={cancel} disabled={saving}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
                <X size={15} /> Cancelar
              </button>
              <button onClick={save} disabled={saving || !hasDirty}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors disabled:opacity-50">
                <Save size={15} /> {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          ) : (
            canEdit && (
              <button onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors">
                Editar personalizações
              </button>
            )
          )
        }
      />

      {/* Contexto do acesso */}
      <div className="bg-white rounded-xl border border-border p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetaRow icon={<UserIcon size={15} />} label="Usuário" value={detail.userName} />
          <MetaRow icon={<Building2 size={15} />} label="Unidade" value={detail.facilityName} />
          <MetaRow
            icon={<Shield size={15} />}
            label="Perfil do acesso"
            value={detail.role ? `${detail.role.name} (${detail.role.code})` : '— sem perfil —'}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          As personalizações abaixo <strong>sobrescrevem</strong> apenas esse acesso — não afetam o perfil, nem outros acessos do mesmo usuário.
          Use <strong>Herdar</strong> para voltar ao comportamento do perfil.
        </p>
      </div>

      <h2 className="text-sm font-semibold mb-3">Permissões do acesso</h2>
      <PermissionMatrix entries={entries} editable={editing && canEdit} onChange={handleChange} />
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function accessToMatrixEntry(
  p: AccessPermissionEntry,
  overrideState?: RolePermissionState,
): RolePermissionEntry {
  const state = overrideState ?? p.state
  // Recalcula effective local se o user mudou o state nesta sessão.
  let effective = p.effective
  if (overrideState !== undefined) {
    effective = overrideState === 'grant' ? true : overrideState === 'deny' ? false : p.roleEffective
  }
  return {
    code: p.code,
    module: p.module,
    resource: p.resource,
    action: p.action,
    description: p.description,
    state,
    effective,
    // Reutiliza o campo "inheritedEffective" do componente para mostrar o que o perfil daria.
    inheritedEffective: p.roleEffective,
    overriddenParent: state !== 'inherit' && effective !== p.roleEffective,
  }
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}
