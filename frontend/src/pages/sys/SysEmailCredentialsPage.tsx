import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound, Save, Trash2, Send, Eye, EyeOff, CheckCircle2, AlertCircle,
  Globe, Building2, MapPin,
} from 'lucide-react'
import {
  emailCredentialsApi,
  type CredentialsScope,
  type EmailCredentials,
  type TestResult,
} from '../../api/emailCredentials'
import { directoryApi, type MunicipalityDto, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ComboBox, type ComboBoxOption } from '../../components/ui/ComboBox'

type ScopeSelection = {
  type: CredentialsScope
  id: string | null   // null = SYSTEM
}

export function SysEmailCredentialsPage() {
  const [selection, setSelection] = useState<ScopeSelection>({ type: 'system', id: null })
  const [municipalities, setMunicipalities] = useState<MunicipalityDto[]>([])
  const [facilities, setFacilities] = useState<FacilityDto[]>([])

  useEffect(() => {
    directoryApi.listMunicipalities('all').then(setMunicipalities).catch(() => setMunicipalities([]))
    directoryApi.listFacilities(undefined, 'all').then(setFacilities).catch(() => setFacilities([]))
  }, [])

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <KeyRound size={20} className="text-violet-500" />
          Credenciais de envio de e-mail
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure a IAM key da AWS SES usada pelo sistema. A resolução é em
          cascata: <strong>unidade → município → padrão da plataforma</strong>.
          Se uma unidade não tem credenciais próprias, cai no município; se o
          município também não, usa o padrão.
        </p>
      </header>

      <ScopePicker
        selection={selection} onChange={setSelection}
        municipalities={municipalities} facilities={facilities}
      />

      <CredentialsEditor
        key={`${selection.type}:${selection.id ?? 'sys'}`}
        selection={selection}
      />
    </div>
  )
}

// ─── Picker de escopo ────────────────────────────────────────────────────────

function ScopePicker({
  selection, onChange, municipalities, facilities,
}: {
  selection: ScopeSelection
  onChange: (s: ScopeSelection) => void
  municipalities: MunicipalityDto[]
  facilities: FacilityDto[]
}) {
  const munOptions = useMemo<ComboBoxOption[]>(
    () => municipalities.map(m => ({ value: m.id, label: m.name, hint: m.state })),
    [municipalities],
  )
  const facOptions = useMemo<ComboBoxOption[]>(
    () => facilities.map(f => ({ value: f.id, label: f.shortName })),
    [facilities],
  )

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-1 mb-3">
        <ScopeTab
          active={selection.type === 'system'} onClick={() => onChange({ type: 'system', id: null })}
          icon={<Globe size={13} />}
        >
          Plataforma
        </ScopeTab>
        <ScopeTab
          active={selection.type === 'municipality'}
          onClick={() => onChange({ type: 'municipality', id: selection.type === 'municipality' ? selection.id : null })}
          icon={<MapPin size={13} />}
        >
          Município
        </ScopeTab>
        <ScopeTab
          active={selection.type === 'facility'}
          onClick={() => onChange({ type: 'facility', id: selection.type === 'facility' ? selection.id : null })}
          icon={<Building2 size={13} />}
        >
          Unidade
        </ScopeTab>
      </div>

      {selection.type === 'municipality' && (
        <ComboBox
          value={selection.id}
          onChange={val => onChange({ type: 'municipality', id: val })}
          placeholder="Selecione o município…"
          options={munOptions}
        />
      )}
      {selection.type === 'facility' && (
        <ComboBox
          value={selection.id}
          onChange={val => onChange({ type: 'facility', id: val })}
          placeholder="Selecione a unidade…"
          options={facOptions}
        />
      )}
      {selection.type === 'system' && (
        <p className="text-xs text-slate-400">
          Configuração padrão da plataforma — usada quando o município
          não tem credenciais próprias.
        </p>
      )}
    </div>
  )
}

// ─── Editor de credenciais ───────────────────────────────────────────────────

function CredentialsEditor({ selection }: { selection: ScopeSelection }) {
  const needsId = selection.type !== 'system'
  const hasId = !needsId || !!selection.id

  const [loading, setLoading] = useState(hasId)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [row, setRow] = useState<EmailCredentials | null>(null)

  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [awsRegion, setAwsRegion] = useState('us-east-1')
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('')
  const [awsSecret, setAwsSecret] = useState('')    // vazio = não alterar
  const [showSecret, setShowSecret] = useState(false)
  const [configurationSet, setConfigurationSet] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [testTo, setTestTo] = useState('')
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const load = useCallback(async () => {
    if (!hasId) { setLoading(false); return }
    setLoading(true)
    try {
      const current = await emailCredentialsApi.get(selection.type, selection.id)
      setRow(current)
      if (current) {
        setFromEmail(current.fromEmail)
        setFromName(current.fromName)
        setAwsRegion(current.awsRegion)
        setAwsAccessKeyId(current.awsAccessKeyId)
        setAwsSecret('')
        setConfigurationSet(current.sesConfigurationSet ?? '')
        setIsActive(current.isActive)
      } else {
        setFromEmail('')
        setFromName('')
        setAwsRegion('us-east-1')
        setAwsAccessKeyId('')
        setAwsSecret('')
        setConfigurationSet('')
        setIsActive(true)
      }
      setTestResult(null)
    } catch {
      toast.error('Falha ao carregar credenciais')
    } finally {
      setLoading(false)
    }
  }, [selection, hasId])

  useEffect(() => { void load() }, [load])

  if (!hasId) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
        Selecione {selection.type === 'municipality' ? 'um município' : 'uma unidade'} para configurar.
      </div>
    )
  }

  const save = async () => {
    if (!fromEmail.trim() || !awsAccessKeyId.trim()) {
      toast.warning('Preencha e-mail remetente e Access Key ID')
      return
    }
    if (!row && !awsSecret.trim()) {
      toast.warning('Secret Access Key é obrigatório na criação')
      return
    }
    setSaving(true)
    try {
      const updated = await emailCredentialsApi.upsert({
        scopeType: selection.type,
        scopeId: selection.id,
        fromEmail: fromEmail.trim(),
        fromName: fromName.trim(),
        awsRegion: awsRegion.trim(),
        awsAccessKeyId: awsAccessKeyId.trim(),
        awsSecretAccessKey: awsSecret.trim() || null,
        sesConfigurationSet: configurationSet.trim() || null,
        isActive,
      })
      setRow(updated)
      setAwsSecret('')
      toast.success('Credenciais salvas')
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Erro ao salvar.'
      toast.error('Falha ao salvar', msg)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!row) return
    if (!confirm('Voltar ao padrão? Essa configuração será apagada e o sistema vai herdar do escopo pai.')) return
    setSaving(true)
    try {
      await emailCredentialsApi.remove(selection.type, selection.id)
      toast.success('Credenciais removidas')
      await load()
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Erro ao remover.'
      toast.error('Falha ao remover', msg)
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    if (!testTo.trim()) { toast.warning('Informe o destinatário'); return }
    setTesting(true); setTestResult(null)
    try {
      const r = await emailCredentialsApi.test(testTo.trim(), selection.type, selection.id)
      setTestResult(r)
      if (r.ok) toast.success('Teste enviado', `origem: ${r.source}`)
      else toast.error('Falha no teste', r.error ?? 'Sem detalhes')
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Erro inesperado.'
      toast.error('Falha no teste', msg)
    } finally { setTesting(false) }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
        Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Credenciais AWS SES</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {row
                ? 'Este escopo tem credenciais próprias.'
                : 'Não configurado — herda do escopo pai (município → plataforma → env).'}
            </p>
          </div>
          <span className={cn(
            'text-[11px] font-semibold uppercase tracking-widest px-2 py-1 rounded-full shrink-0',
            row
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500',
          )}>
            {row ? 'Configurado' : 'Herdado'}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="E-mail remetente *" hint="Precisa ser uma identidade verificada no SES">
            <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)}
              placeholder="nao-responder@exemplo.gov.br" className={inputCls} />
          </Field>
          <Field label="Nome do remetente" hint="Aparece no campo &quot;De&quot; do e-mail">
            <input value={fromName} onChange={e => setFromName(e.target.value)}
              placeholder="Prefeitura de X" className={inputCls} />
          </Field>
          <Field label="Região AWS *">
            <input value={awsRegion} onChange={e => setAwsRegion(e.target.value)}
              placeholder="us-east-1" className={inputCls} />
          </Field>
          <Field label="Configuration Set" hint="Opcional — tracking SNS de bounces">
            <input value={configurationSet} onChange={e => setConfigurationSet(e.target.value)}
              placeholder="zsaude-prod" className={inputCls} />
          </Field>
          <Field label="AWS Access Key ID *">
            <input value={awsAccessKeyId} onChange={e => setAwsAccessKeyId(e.target.value)}
              placeholder="AKIA…" className={cn(inputCls, 'font-mono')} />
          </Field>
          <Field
            label={row ? 'AWS Secret Access Key (vazio = manter)' : 'AWS Secret Access Key *'}
            hint="Cifrada em repouso via Fernet"
          >
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={awsSecret} onChange={e => setAwsSecret(e.target.value)}
                placeholder={row ? '(gravada — deixe vazio pra manter)' : 'sua-secret'}
                className={cn(inputCls, 'font-mono pr-10')}
              />
              <button type="button" onClick={() => setShowSecret(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Ativo (quando desligado, a cascata pula este escopo)
          </label>
          <div className="flex items-center gap-2">
            {row && (
              <button type="button" onClick={reset} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-500 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-800 transition-colors disabled:opacity-50">
                <Trash2 size={14} />
                Voltar ao padrão
              </button>
            )}
            <button type="button" onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors">
              <Save size={14} />
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {/* Card de teste */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
          <Send size={14} className="text-sky-500" />
          Envio de teste
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Dispara um e-mail curto pra validar as credenciais <strong>resolvidas
          em cascata</strong> a partir deste escopo. Em sandbox, o destinatário
          precisa estar verificado no SES.
        </p>
        <div className="flex gap-2">
          <input type="email" value={testTo} onChange={e => setTestTo(e.target.value)}
            placeholder="destinatario@exemplo.com"
            className={cn(inputCls, 'flex-1')} />
          <button type="button" onClick={runTest} disabled={testing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors">
            <Send size={14} />
            {testing ? 'Enviando…' : 'Enviar teste'}
          </button>
        </div>
        {testResult && (
          <div className={cn(
            'mt-3 flex items-start gap-2 p-3 rounded-lg text-sm border',
            testResult.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300',
          )}>
            {testResult.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <AlertCircle size={15} className="shrink-0 mt-0.5" />}
            <div className="flex-1">
              {testResult.ok ? (
                <>
                  <p className="font-medium">Entregue com sucesso</p>
                  <p className="text-xs mt-1">
                    Origem: <strong>{testResult.source}</strong> · Remetente:{' '}
                    <strong>{testResult.fromEmail}</strong> · MessageId:{' '}
                    <code className="font-mono text-[10px]">{testResult.messageId?.slice(0, 28)}…</code>
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Falhou</p>
                  <p className="text-xs mt-1">{testResult.error}</p>
                  <p className="text-xs mt-1 opacity-70">
                    Origem tentada: <strong>{testResult.source}</strong>
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers UI ──────────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

function ScopeTab({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
        active
          ? 'bg-violet-600 text-white'
          : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200'
