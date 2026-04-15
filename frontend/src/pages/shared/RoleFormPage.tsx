import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { rolesApi, type RoleSummary } from '../../api/roles'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'

export function RoleFormPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState('')
  const [parents, setParents] = useState<RoleSummary[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    rolesApi.list({ includeArchived: false })
      .then(rs => setParents(rs))
      .catch(() => setParents([]))
  }, [])

  const save = async () => {
    setError('')
    if (!code.match(/^[a-z0-9_]+$/)) return setError('Código deve conter só letras minúsculas, números e _.')
    if (!name.trim()) return setError('Informe o nome.')

    setSaving(true)
    try {
      const created = await rolesApi.create({
        code,
        name,
        description: description || null,
        parentId: parentId || null,
      })
      toast.success('Perfil criado', created.name)
      navigate(`/shared/perfis/${created.id}`)
    } catch (e) {
      toast.error('Falha ao criar', e instanceof HttpError ? e.message : 'Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Novo perfil" back="/shared/perfis" />

      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <Field label="Código" hint="Identificador técnico. Minúsculas, números e _ apenas.">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toLowerCase())}
            placeholder="recep_gineco"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono"
          />
        </Field>

        <Field label="Nome">
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

        <Field label="Herda de" hint="Herdar de um perfil base economiza trabalho — você só customiza o que precisa.">
          <select
            value={parentId}
            onChange={e => setParentId(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">— sem herança —</option>
            {parents.filter(p => !p.archived).map(p => (
              <option key={p.id} value={p.id}>
                [{p.scope === 'SYSTEM' ? 'herdado' : 'local'}] {p.name}
              </option>
            ))}
          </select>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button onClick={() => navigate('/shared/perfis')}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors disabled:opacity-50">
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
