import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { rolesAdminApi, type RoleScope, type RoleSummary } from '../../api/roles'
import { sysApi, type MunicipalityAdminDetail } from '../../api/sys'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'

export function SysRoleFormPage() {
  const navigate = useNavigate()
  const [scope, setScope] = useState<RoleScope>('MUNICIPALITY')
  const [municipalityId, setMunicipalityId] = useState<string>('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [municipalities, setMunicipalities] = useState<MunicipalityAdminDetail[]>([])
  const [parents, setParents] = useState<RoleSummary[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    sysApi.listMunicipalities(false).then(setMunicipalities).catch(() => {})
  }, [])

  // Recarrega lista de parents candidatos conforme escopo e município.
  useEffect(() => {
    const params = scope === 'SYSTEM'
      ? { scope: 'SYSTEM' as RoleScope, includeArchived: false }
      : { municipalityId: municipalityId || undefined, includeArchived: false }
    rolesAdminApi.list(params).then(setParents).catch(() => setParents([]))
  }, [scope, municipalityId])

  const save = async () => {
    setError('')
    if (!code.match(/^[a-z0-9_]+$/)) return setError('Código deve conter só letras minúsculas, números e _.')
    if (!name.trim()) return setError('Informe o nome.')
    if (scope === 'MUNICIPALITY' && !municipalityId) return setError('Selecione o município.')

    setSaving(true)
    try {
      const created = await rolesAdminApi.create(
        {
          code,
          name,
          description: description || null,
          parentId: parentId || null,
        },
        { municipalityId: scope === 'MUNICIPALITY' ? municipalityId : undefined },
      )
      toast.success('Perfil criado', created.name)
      navigate(`/sys/perfis/${created.id}`)
    } catch (e) {
      toast.error('Falha ao criar', e instanceof HttpError ? e.message : 'Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Novo perfil" back="/sys/perfis" />

      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <Field label="Escopo">
          <div className="flex gap-2">
            {(['SYSTEM', 'MUNICIPALITY'] as RoleScope[]).map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                  scope === s
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {s === 'SYSTEM' ? 'Plataforma (base)' : 'Município (local)'}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {scope === 'SYSTEM'
              ? 'Visível em todos os municípios. Normalmente não precisa criar — os perfis base da plataforma cobrem a maioria dos casos.'
              : 'Vinculado a um município. Pode herdar de um perfil da plataforma ou de outro perfil local do mesmo município.'}
          </p>
        </Field>

        {scope === 'MUNICIPALITY' && (
          <Field label="Município">
            <select
              value={municipalityId}
              onChange={e => setMunicipalityId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">— selecione —</option>
              {municipalities.map(m => (
                <option key={m.id} value={m.id}>{m.name}/{m.state}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Código" hint="Identificador técnico. Minúsculas, números e _ apenas. Ex: recep_gineco">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toLowerCase())}
            placeholder="recep_gineco"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono"
          />
        </Field>

        <Field label="Nome" hint="Como aparece nas telas.">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Recepção Ginecologia"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
        </Field>

        <Field label="Descrição">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
        </Field>

        <Field label="Herda de" hint="Permissões do pai são herdadas e podem ser customizadas depois.">
          <select
            value={parentId}
            onChange={e => setParentId(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">— sem herança (começa do zero) —</option>
            {parents.filter(p => !p.archived).map(p => (
              <option key={p.id} value={p.id}>
                [{p.scope}] {p.name}
              </option>
            ))}
          </select>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={() => navigate('/sys/perfis')}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Save size={15} /> {saving ? 'Criando…' : 'Criar perfil'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}
