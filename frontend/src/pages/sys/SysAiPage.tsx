import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Server, Cpu, Route as RouteIcon, ScrollText, KeyRound, Gauge,
  BarChart3, Plus, Trash2, Save, Loader2, Pencil, X, AlertCircle, Edit3,
  CheckCircle2, XCircle, Globe, MapPin, Eye, EyeOff, Zap, RefreshCw,
} from 'lucide-react'
import { HttpError } from '../../api/client'
import {
  sysAiApi, type AIModelRead, type AIModelWrite, type AIProviderRead,
  type AIProviderWrite, type AIRouteRead, type AIRouteWrite,
  type AIPromptTemplateRead, type AIPromptTemplateWrite, type SdkKind,
  type Capability, type AIMunicipalityKeyRead, type AIQuotaRead,
  type AIUsageListResponse, type AIUsageSummary,
  type AITimeseriesPoint, type AITopOperation,
} from '../../api/ai'
import { sysApi, type MunicipalityAdminDetail } from '../../api/sys'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const CAPABILITIES: Capability[] = ['chat', 'chat_vision', 'embed_text', 'embed_image', 'transcribe']
const SDK_KINDS: SdkKind[] = ['openai', 'openrouter', 'anthropic', 'ollama']

// Labels amigáveis pra capabilities (o slug técnico vai pro backend).
const CAPABILITY_LABELS: Record<string, string> = {
  chat: 'Conversa (texto)',
  chat_vision: 'Conversa com imagem',
  embed_text: 'Vetorização de texto',
  embed_image: 'Vetorização de imagem',
  transcribe: 'Transcrição de áudio',
}

const capLabel = (c: string) => CAPABILITY_LABELS[c] ?? c

const SCOPE_LABELS: Record<string, string> = {
  global: 'Padrão do sistema',
  municipality: 'Todo o município',
  module: 'Um módulo do município',
}
const scopeLabel = (s: string) => SCOPE_LABELS[s] ?? s

// Formata centavos de USD como "$1.23" (ou "$0.002500" quando precisa de precisão).
function formatUSD(cents: number, digits = 2): string {
  const value = cents / 100
  if (value > 0 && value < 0.01 && digits <= 2) {
    return `$${value.toFixed(4)}`
  }
  return `$${value.toFixed(digits)}`
}

type Tab = 'keys' | 'routes' | 'quotas' | 'usage' | 'providers' | 'models' | 'prompts'

const TABS: { id: Tab; label: string; icon: React.ReactNode; group: 'scope' | 'catalog' }[] = [
  { id: 'keys',      label: 'Chaves de API',    icon: <KeyRound size={14} />,  group: 'scope' },
  { id: 'routes',    label: 'Roteamento',       icon: <RouteIcon size={14} />, group: 'scope' },
  { id: 'quotas',    label: 'Limites de uso',   icon: <Gauge size={14} />,     group: 'scope' },
  { id: 'usage',     label: 'Consumo',          icon: <BarChart3 size={14} />, group: 'scope' },
  { id: 'providers', label: 'Provedores',       icon: <Server size={14} />,    group: 'catalog' },
  { id: 'models',    label: 'Modelos',          icon: <Cpu size={14} />,       group: 'catalog' },
  { id: 'prompts',   label: 'Instruções (prompts)', icon: <ScrollText size={14} />,group: 'catalog' },
]

// ─── Página ──────────────────────────────────────────────────────────────────

export function SysAiPage() {
  const [tab, setTab] = useState<Tab>('keys')
  const [scopeMunId, setScopeMunId] = useState<string | null>(null)  // null = global
  const [municipalities, setMunicipalities] = useState<MunicipalityAdminDetail[]>([])

  useEffect(() => {
    void sysApi.listMunicipalities()
      .then(ms => setMunicipalities(ms.filter(m => !m.archived)))
      .catch(() => { /* silencioso — seletor fica só com 'Global' */ })
  }, [])

  const scopeSupports = (t: Tab) =>
    t === 'keys' || t === 'routes' || t === 'quotas' || t === 'usage'

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center">
          <Sparkles size={18} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Integração de IA</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aqui você define como a IA funciona no sistema: qual provedor usar, que
            chave de acesso, quais limites de gasto. A configuração padrão vale
            para <strong>todos os municípios</strong>. Você só personaliza quando um
            município específico precisar de algo diferente.
          </p>
        </div>
      </header>

      {/* Seletor de escopo — só aparece nas tabs que aceitam escopo */}
      {scopeSupports(tab) && (
        <div className="mb-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Você está configurando:
          </span>
          <button
            onClick={() => setScopeMunId(null)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border',
              scopeMunId === null
                ? 'bg-violet-600 border-violet-600 text-white'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800')}
          >
            <Globe size={13} /> Para todos os municípios
          </button>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <MapPin size={13} className="text-slate-400" />
            <select
              value={scopeMunId ?? ''}
              onChange={e => setScopeMunId(e.target.value || null)}
              className="flex-1 max-w-xs text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            >
              <option value="">Só para um município específico...</option>
              {municipalities.map(m => (
                <option key={m.id} value={m.id}>{m.name}/{m.state}</option>
              ))}
            </select>
          </div>
          {scopeMunId && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
              configuração específica
            </span>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex gap-1 px-3 pt-3 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-t-md text-sm border-b-2 transition-colors whitespace-nowrap',
                tab === t.id
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'keys'      && <KeysTab scopeMunId={scopeMunId} />}
          {tab === 'routes'    && <RoutesTab scopeMunId={scopeMunId} />}
          {tab === 'quotas'    && <QuotasTab scopeMunId={scopeMunId} />}
          {tab === 'usage'     && <UsageTab scopeMunId={scopeMunId} />}
          {tab === 'providers' && <ProvidersTab />}
          {tab === 'models'    && <ModelsTab />}
          {tab === 'prompts'   && <PromptsTab />}
        </div>
      </div>
    </div>
  )
}

// ─── Chaves (global/municipal) ──────────────────────────────────────────────

function KeysTab({ scopeMunId }: { scopeMunId: string | null }) {
  const [keys, setKeys] = useState<AIMunicipalityKeyRead[]>([])
  const [providers, setProviders] = useState<AIProviderRead[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AIProviderRead | null>(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [k, p] = await Promise.all([
        sysAiApi.listKeys(scopeMunId ?? undefined),
        sysAiApi.listProviders(),
      ])
      setKeys(k); setProviders(p.filter(x => x.active))
    } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [scopeMunId])  // eslint-disable-line

  const byProvider = useMemo(() => {
    const m = new Map<string, AIMunicipalityKeyRead>()
    keys.forEach(k => m.set(k.providerId, k))
    return m
  }, [keys])

  const handleDelete = async (providerId: string) => {
    if (!confirm('Remover a chave neste escopo?')) return
    try {
      await sysAiApi.deleteKey(providerId, scopeMunId ?? undefined)
      toast.success('Chave removida.')
      await reload()
    } catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
  }

  const handleTest = async (providerId: string, slug: string) => {
    try {
      const res = await sysAiApi.testKey(providerId, scopeMunId ?? undefined)
      if (res.ok) toast.success(`${slug} OK`, res.detail)
      else toast.error(`${slug} falhou`, res.detail)
    } catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
  }

  return (
    <div className="space-y-3">
      <InfoBar>
        {scopeMunId
          ? 'Esta chave será usada apenas por este município. Se não cadastrar aqui, ele continua usando a chave padrão configurada para todos.'
          : 'Esta é a chave principal que todo o sistema vai usar. Ela fica criptografada no banco — ninguém consegue ver ela depois de salvar, só os últimos 4 dígitos.'}
      </InfoBar>

      {loading ? <Spinner /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {providers.map(p => {
            const k = byProvider.get(p.id)
            return (
              <div key={p.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{p.displayName}</p>
                    <p className="text-xs text-slate-500 font-mono">{p.slug}</p>
                  </div>
                  {k?.configured ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={11} /> ativa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                      <XCircle size={11} /> não configurada
                    </span>
                  )}
                </div>
                {k?.configured && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                    <div>Termina em: <span className="font-mono">...{k.keyLast4}</span></div>
                    <div className="text-[10px] font-mono">identificador: {k.keyFingerprint}</div>
                    {k.baseUrlOverride && <div className="text-[10px] font-mono break-all">URL: {k.baseUrlOverride}</div>}
                  </div>
                )}
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => setEditing(p)}
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                    {k?.configured ? 'Trocar chave' : 'Cadastrar chave'}
                  </button>
                  {k?.configured && (
                    <>
                      <button onClick={() => handleTest(p.id, p.slug)} title="Testar se está funcionando"
                        className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Zap size={12} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} title="Remover chave"
                        className="px-2.5 py-1.5 text-xs border border-rose-200 dark:border-rose-800 text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40">
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {providers.length === 0 && <div className="col-span-2 py-6 text-center text-sm text-slate-500">Nenhum provedor de IA cadastrado no catálogo.</div>}
        </div>
      )}

      {editing && (
        <KeyEditor provider={editing} current={byProvider.get(editing.id) ?? null}
          scopeMunId={scopeMunId}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload() }} />
      )}
    </div>
  )
}

function KeyEditor({
  provider, current, scopeMunId, onClose, onSaved,
}: {
  provider: AIProviderRead
  current: AIMunicipalityKeyRead | null
  scopeMunId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(current?.baseUrlOverride ?? '')
  const [active, setActive] = useState(current?.active ?? true)
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!current && !apiKey) { toast.error('Cole a chave antes de salvar.'); return }
    setSaving(true)
    try {
      await sysAiApi.putKey({
        providerId: provider.id,
        apiKey: apiKey || null,
        baseUrlOverride: baseUrl,
        active,
      }, scopeMunId ?? undefined)
      toast.success('Chave salva.')
      onSaved()
    } catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`${provider.displayName} — ${scopeMunId ? 'chave específica do município' : 'chave padrão do sistema'}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Chave de API
            {current && !apiKey && <span className="text-emerald-600 ml-2">· mantendo a atual (termina em {current.keyLast4})</span>}
          </label>
          <div className="mt-1 flex gap-1">
            <input type={show ? 'text' : 'password'} value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={current ? '••••••••  (cole uma nova só se quiser trocar)' : 'Cole sua chave aqui (ex: sk-...)'}
              className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
            <button type="button" onClick={() => setShow(!show)}
              className="px-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              title={show ? 'Ocultar' : 'Mostrar'}>
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            A chave é criptografada antes de ser salva. Depois você só consegue
            ver os últimos 4 caracteres.
          </p>
        </div>
        <LabeledInput
          label="Endereço do servidor (opcional)"
          value={baseUrl} onChange={setBaseUrl}
          placeholder={provider.baseUrlDefault || 'Deixe em branco para usar o padrão'}
          mono
        />
        {provider.sdkKind === 'ollama' && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 -mt-2">
            O Ollama roda localmente. Informe a URL onde o backend consegue
            acessar — normalmente http://localhost:11434 ou o endereço
            interno da sua rede.
          </p>
        )}
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          Chave habilitada
        </label>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
    </Modal>
  )
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

function RoutesTab({ scopeMunId }: { scopeMunId: string | null }) {
  const [routes, setRoutes] = useState<AIRouteRead[]>([])
  const [models, setModels] = useState<AIModelRead[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const [r, m] = await Promise.all([
        sysAiApi.listRoutes(scopeMunId ?? undefined),
        sysAiApi.listModels(),
      ])
      setRoutes(r); setModels(m.filter(x => x.active))
    } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [scopeMunId])  // eslint-disable-line

  const handleDelete = async (r: AIRouteRead) => {
    if (!confirm(`Remover rota ${r.capability} → ${r.modelSlug}?`)) return
    try { await sysAiApi.deleteRoute(r.id); toast.success('Rota removida.'); await reload() }
    catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
  }

  return (
    <div className="space-y-3">
      <InfoBar>
        {scopeMunId
          ? 'Estas rotas se aplicam apenas a este município. Se ele não tiver uma rota própria para algum tipo de tarefa, usa a padrão do sistema.'
          : 'Aqui você decide qual modelo de IA vai atender cada tipo de tarefa (conversa, leitura de imagem, embeddings). Pode cadastrar mais de uma opção para cada — se a primeira falhar, o sistema tenta a próxima automaticamente.'}
      </InfoBar>

      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
          <Plus size={13} /> Nova rota
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Alcance</th>
                <th className="text-left px-3 py-2">Tarefa</th>
                <th className="text-left px-3 py-2">Módulo</th>
                <th className="text-left px-3 py-2">Provedor</th>
                <th className="text-left px-3 py-2">Modelo</th>
                <th className="text-right px-3 py-2" title="Menor = tentada primeiro">Ordem</th>
                <th className="text-center px-3 py-2">Ativa</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {routes.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-xs">{scopeLabel(r.scope)}</td>
                  <td className="px-3 py-2 text-xs">{capLabel(r.capability)}</td>
                  <td className="px-3 py-2 text-xs">{r.moduleCode || '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.providerSlug}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.modelSlug}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{r.priority}</td>
                  <td className="px-3 py-2 text-center">{r.active ? <CheckCircle2 size={14} className="inline text-emerald-500" /> : <XCircle size={14} className="inline text-rose-500" />}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => handleDelete(r)} className="p-1 text-slate-400 hover:text-rose-600" title="Remover"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {routes.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-slate-400 text-sm">
                  {scopeMunId ? 'Este município ainda não tem rotas próprias — está usando as padrão do sistema.' : 'Nenhuma rota padrão cadastrada ainda.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <RouteEditor scopeMunId={scopeMunId} models={models}
          onClose={() => setCreating(false)}
          onSaved={async () => { setCreating(false); await reload() }} />
      )}
    </div>
  )
}

function RouteEditor({
  scopeMunId, models, onClose, onSaved,
}: { scopeMunId: string | null; models: AIModelRead[]; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'global' | 'municipality' | 'module'>(
    scopeMunId ? 'municipality' : 'global',
  )
  const [moduleCode, setModuleCode] = useState('hsp')
  const [capability, setCapability] = useState<string>('chat')
  const [modelId, setModelId] = useState(models[0]?.id ?? '')
  const [priority, setPriority] = useState(0)
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: AIRouteWrite = {
        scope: mode,
        municipalityId: mode === 'global' ? null : scopeMunId,
        moduleCode: mode === 'module' ? moduleCode : null,
        capability,
        modelId,
        priority,
        active,
      }
      await sysAiApi.putRoute(payload)
      toast.success('Rota salva.')
      onSaved()
    } catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Nova rota" onClose={onClose}>
      <div className="space-y-4">
        {scopeMunId ? (
          <LabeledSelect label="Alcance desta rota" value={mode} onChange={v => setMode(v as typeof mode)}
            options={[
              { value: 'municipality', label: 'Todo o município' },
              { value: 'module', label: 'Apenas um módulo deste município' },
            ]} />
        ) : (
          <div className="text-xs text-slate-500">
            Alcance: <strong>Padrão do sistema</strong> (vale para todos os municípios).
            Se quiser configurar só para um município, escolha ele no topo da página.
          </div>
        )}
        {mode === 'module' && (
          <LabeledSelect label="Módulo" value={moduleCode} onChange={setModuleCode}
            options={[
              { value: 'hsp', label: 'HSP — Hospitalar' },
              { value: 'cln', label: 'CLN — Clínica' },
              { value: 'dgn', label: 'DGN — Diagnóstico' },
              { value: 'ops', label: 'OPS — Operações' },
              { value: 'fsc', label: 'FSC — Fiscal' },
              { value: 'pln', label: 'PLN — Planos' },
            ]} />
        )}
        <LabeledSelect label="Tipo de tarefa" value={capability} onChange={setCapability}
          options={CAPABILITIES.map(c => ({ value: c, label: capLabel(c) }))} />
        <LabeledSelect label="Modelo que vai atender" value={modelId} onChange={setModelId}
          options={models.map(m => ({ value: m.id, label: `${m.providerSlug} · ${m.slug}` }))} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledNumber
            label="Ordem de tentativa"
            hint="0 = tenta primeiro. Cadastre outra rota com número maior para usar como reserva."
            value={priority} onChange={setPriority}
          />
          <label className="inline-flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            Rota ativa
          </label>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
    </Modal>
  )
}

// ─── Quotas ──────────────────────────────────────────────────────────────────

function QuotasTab({ scopeMunId }: { scopeMunId: string | null }) {
  const [quota, setQuota] = useState<AIQuotaRead | null>(null)
  const [maxTokens, setMaxTokens] = useState(0)
  const [maxCost, setMaxCost] = useState(0)
  const [maxRequests, setMaxRequests] = useState(0)
  const [maxPerUser, setMaxPerUser] = useState(0)
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const items = await sysAiApi.listQuotas(scopeMunId ?? undefined)
      const q = items[0] ?? null
      setQuota(q)
      if (q) {
        setMaxTokens(q.maxTokens); setMaxCost(q.maxCostCents)
        setMaxRequests(q.maxRequests); setMaxPerUser(q.maxPerUserTokens)
        setActive(q.active)
      } else {
        setMaxTokens(0); setMaxCost(0); setMaxRequests(0); setMaxPerUser(0); setActive(true)
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [scopeMunId])  // eslint-disable-line

  const handleSave = async () => {
    setSaving(true)
    try {
      await sysAiApi.putQuota({
        maxTokens, maxCostCents: maxCost, maxRequests,
        maxPerUserTokens: maxPerUser, active,
      }, scopeMunId ?? undefined)
      toast.success('Quota salva.')
      await reload()
    } catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirm('Remover quota deste escopo?')) return
    try { await sysAiApi.deleteQuota(scopeMunId ?? undefined); toast.success('Quota removida.'); await reload() }
    catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
  }

  if (loading) return <Spinner />

  // UI trabalha em USD (o usuário digita "$12.50"); convertemos pra cents
  // no momento do save.
  const maxCostUsd = maxCost / 100

  return (
    <div className="space-y-4">
      <InfoBar warn>
        Use <strong>0</strong> quando não quiser aplicar limite naquele item.
        Nesta primeira versão os valores ficam registrados mas o bloqueio
        automático ainda não está ativo — serve como referência para
        monitorar o consumo.
      </InfoBar>

      <div className="grid grid-cols-2 gap-4">
        <LabeledNumber
          label="Tokens por mês"
          hint="Limite total de tokens (entrada + saída). 0 = sem limite."
          value={maxTokens} onChange={setMaxTokens}
        />
        <LabeledNumber
          label="Gasto máximo por mês (USD)"
          hint="Limite em dólares. Use decimais — ex: 25.50"
          value={maxCostUsd} step={0.01}
          onChange={v => setMaxCost(Math.round(v * 100))}
        />
        <LabeledNumber
          label="Chamadas por mês"
          hint="Número máximo de chamadas à IA. 0 = sem limite."
          value={maxRequests} onChange={setMaxRequests}
        />
        <LabeledNumber
          label="Tokens por usuário/mês"
          hint="Limite individual de cada usuário. 0 = sem limite."
          value={maxPerUser} onChange={setMaxPerUser}
        />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
        Limites habilitados
      </label>

      <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800">
        {quota ? (
          <button onClick={handleDelete} className="text-xs text-rose-600 hover:underline">
            Remover limites
          </button>
        ) : <span />}
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-60">
          {saving
            ? <><Loader2 size={13} className="animate-spin" /> Salvando...</>
            : <><Save size={14} /> {quota ? 'Atualizar limites' : 'Salvar limites'}</>}
        </button>
      </div>
    </div>
  )
}

// ─── Consumo ─────────────────────────────────────────────────────────────────

function UsageTab({ scopeMunId }: { scopeMunId: string | null }) {
  const [summary, setSummary] = useState<AIUsageSummary | null>(null)
  const [timeseries, setTimeseries] = useState<AITimeseriesPoint[]>([])
  const [topOps, setTopOps] = useState<AITopOperation[]>([])
  const [list, setList] = useState<AIUsageListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const reload = async () => {
    setLoading(true)
    try {
      const mun = scopeMunId ?? undefined
      const [s, ts, top, l] = await Promise.all([
        sysAiApi.usageSummary(undefined, undefined, mun),
        sysAiApi.usageTimeseries({ municipalityId: mun }),
        sysAiApi.topOperations({ municipalityId: mun }),
        sysAiApi.listUsage({ municipalityId: mun, page, pageSize: 20 }),
      ])
      setSummary(s); setTimeseries(ts); setTopOps(top); setList(l)
    } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [page, scopeMunId])  // eslint-disable-line

  return (
    <div className="space-y-4">
      <InfoBar>
        {scopeMunId
          ? 'Consumo apenas deste município.'
          : 'Consumo de todos os municípios do sistema.'}
      </InfoBar>

      {loading && <Spinner />}

      {/* Cards de resumo */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Chamadas" value={String(summary.requests)} />
          <StatCard label="Sucesso" value={String(summary.successCount)} accent="emerald" />
          <StatCard label="Falhas" value={String(summary.failureCount)} accent={summary.failureCount > 0 ? 'rose' : undefined} />
          <StatCard label="Tokens usados" value={(summary.tokensIn + summary.tokensOut).toLocaleString('pt-BR')} />
          <StatCard label="Custo total" value={formatUSD(summary.totalCostCents)} accent="violet" />
        </div>
      )}

      {/* Gráfico de chamadas por dia */}
      {timeseries.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Chamadas por dia</p>
          <UsageChart data={timeseries} />
        </div>
      )}

      {/* Gráfico + top operations lado a lado */}
      {topOps.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Tarefas mais usadas</p>
          <div className="space-y-2">
            {topOps.map(op => {
              const maxReq = topOps[0]?.requests ?? 1
              const pct = Math.round((op.requests / maxReq) * 100)
              return (
                <div key={op.operationSlug} className="flex items-center gap-3">
                  <span className="font-mono text-xs w-48 truncate text-slate-700 dark:text-slate-200">{op.operationSlug}</span>
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 w-24 text-right">
                    {op.requests} ({formatUSD(op.totalCostCents)})
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabela detalhada */}
      <div className="flex justify-end">
        <button onClick={reload} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Data e hora</th>
              <th className="text-left px-3 py-2">Tarefa</th>
              <th className="text-left px-3 py-2">Módulo</th>
              <th className="text-left px-3 py-2">Modelo</th>
              <th className="text-right px-3 py-2">Tokens</th>
              <th className="text-right px-3 py-2">Custo</th>
              <th className="text-right px-3 py-2">Tempo</th>
              <th className="text-center px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(list?.items ?? []).map(l => (
              <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(l.at).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.operationSlug}</td>
                <td className="px-3 py-2 text-xs">{l.moduleCode}</td>
                <td className="px-3 py-2 text-xs">{l.providerSlug}/{l.modelSlug}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{(l.tokensIn + l.tokensOut).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatUSD(l.totalCostCents)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{(l.latencyMs / 1000).toFixed(2)}s</td>
                <td className="px-3 py-2 text-center">
                  {l.success
                    ? <CheckCircle2 size={13} className="inline text-emerald-500" />
                    : <span title={l.errorMessage}><XCircle size={13} className="inline text-rose-500" /></span>}
                </td>
              </tr>
            ))}
            {(list?.items ?? []).length === 0 && <tr><td colSpan={8} className="py-6 text-center text-sm text-slate-400">Nenhuma chamada registrada ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      {list && list.total > list.pageSize && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div>Total: {list.total}</div>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-40">Anterior</button>
            <span className="self-center">Página {page}</span>
            <button disabled={list.items.length < list.pageSize} onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-40">Próxima</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Lazy import: recharts é grande; carrega só quando UsageTab renderiza.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _recharts: any = null

function UsageChart({ data }: { data: AITimeseriesPoint[] }) {
  const [rc, setRc] = useState<typeof _recharts>(null)
  useEffect(() => {
    if (_recharts) { setRc(_recharts); return }
    void import('recharts').then(m => { _recharts = m; setRc(m) })
  }, [])

  if (!rc) return <div className="h-[200px] flex items-center justify-center text-xs text-slate-400">Carregando gráfico...</div>

  const { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } = rc

  const formatted = data.map(d => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          labelFormatter={(v: string) => v}
          formatter={(v: number, name: string) => [v, name === 'successes' ? 'Sucesso' : 'Falhas']}
        />
        <Area type="monotone" dataKey="successes" stackId="1"
          fill="#10b981" stroke="#10b981" fillOpacity={0.3} name="successes" />
        <Area type="monotone" dataKey="failures" stackId="1"
          fill="#f43f5e" stroke="#f43f5e" fillOpacity={0.3} name="failures" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Providers tab (catálogo — sem escopo) ──────────────────────────────────

function ProvidersTab() {
  const [items, setItems] = useState<AIProviderRead[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AIProviderRead | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = async () => {
    setLoading(true)
    try { setItems(await sysAiApi.listProviders()) }
    finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])

  const handleDelete = async (p: AIProviderRead) => {
    if (!confirm(`Remover o provedor ${p.slug}?`)) return
    try { await sysAiApi.deleteProvider(p.id); toast.success('Provedor removido.'); await reload() }
    catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
  }

  return (
    <div className="space-y-3">
      <InfoBar>
        Provedores são as empresas ou serviços que disponibilizam IA (OpenAI,
        OpenRouter, Ollama, etc). Só liste aqui os que sua organização vai
        usar — para cada um você cadastra uma chave depois.
      </InfoBar>

      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {items.length} {items.length === 1 ? 'provedor cadastrado' : 'provedores cadastrados'}
        </p>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
          <Plus size={13} /> Novo provedor
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500">
              <tr>
                <th className="text-left px-3 py-2" title="Identificador técnico">Identificador</th>
                <th className="text-left px-3 py-2">Nome</th>
                <th className="text-left px-3 py-2" title="Tipo de API/SDK">Tecnologia</th>
                <th className="text-left px-3 py-2">Endereço padrão</th>
                <th className="text-left px-3 py-2">Tarefas suportadas</th>
                <th className="text-center px-3 py-2">Ativo</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-mono text-xs">{p.slug}</td>
                  <td className="px-3 py-2">{p.displayName}</td>
                  <td className="px-3 py-2 text-xs">{p.sdkKind}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-xs">{p.baseUrlDefault || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {p.capabilities.map(c => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" title={c}>
                          {capLabel(c)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.active ? <CheckCircle2 size={14} className="inline text-emerald-500" /> : <XCircle size={14} className="inline text-rose-500" />}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(p)} className="p-1 text-slate-400 hover:text-violet-600" title="Editar"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(p)} className="p-1 text-slate-400 hover:text-rose-600" title="Remover"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ProviderEditor initial={editing}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={async () => { setEditing(null); setCreating(false); await reload() }} />
      )}
    </div>
  )
}

function ProviderEditor({
  initial, onClose, onSaved,
}: { initial: AIProviderRead | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AIProviderWrite>({
    slug: initial?.slug ?? '',
    displayName: initial?.displayName ?? '',
    sdkKind: initial?.sdkKind ?? 'openai',
    baseUrlDefault: initial?.baseUrlDefault ?? '',
    capabilities: initial?.capabilities ?? [],
    active: initial?.active ?? true,
  })
  const [saving, setSaving] = useState(false)

  const toggleCap = (c: string) =>
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(c)
        ? f.capabilities.filter(x => x !== c)
        : [...f.capabilities, c],
    }))

  const handleSave = async () => {
    setSaving(true)
    try {
      if (initial) await sysAiApi.updateProvider(initial.id, form)
      else await sysAiApi.createProvider(form)
      toast.success('Provedor salvo.'); onSaved()
    } catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={initial ? `Editar provedor: ${initial.slug}` : 'Novo provedor'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="Identificador"
            hint="Nome curto em minúsculas, sem espaços (ex: openai, groq, local-lab)."
            value={form.slug} onChange={v => setForm(f => ({ ...f, slug: v }))}
            placeholder="openai" readOnly={!!initial} mono
          />
          <LabeledSelect
            label="Tecnologia da API"
            value={form.sdkKind}
            onChange={v => setForm(f => ({ ...f, sdkKind: v as SdkKind }))}
            options={SDK_KINDS.map(v => ({ value: v, label: v }))}
          />
        </div>
        <LabeledInput
          label="Nome para exibir"
          hint="Como aparece para os usuários (ex: OpenAI, Anthropic via OpenRouter)."
          value={form.displayName}
          onChange={v => setForm(f => ({ ...f, displayName: v }))}
        />
        <LabeledInput
          label="Endereço padrão (opcional)"
          hint="Só preencha se o provedor tem URL customizada. Ex: Ollama roda em http://localhost:11434."
          value={form.baseUrlDefault ?? ''}
          onChange={v => setForm(f => ({ ...f, baseUrlDefault: v }))} mono
          placeholder="https://api.openai.com/v1"
        />
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tarefas que este provedor consegue atender
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-2">
            Marque só as que os modelos deste provedor suportam — evita tentar
            usar vision num modelo só de texto, por exemplo.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CAPABILITIES.map(c => (
              <button key={c} type="button" onClick={() => toggleCap(c)}
                className={cn('text-xs px-2 py-1 rounded border',
                  form.capabilities.includes(c)
                    ? 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-950/40 dark:border-violet-700'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500')}
              >{capLabel(c)}</button>
            ))}
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
          Provedor habilitado
        </label>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
    </Modal>
  )
}

// ─── Models tab ──────────────────────────────────────────────────────────────

function ModelsTab() {
  const [items, setItems] = useState<AIModelRead[]>([])
  const [providers, setProviders] = useState<AIProviderRead[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AIModelRead | null>(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<string>('')

  const reload = async () => {
    setLoading(true)
    try {
      const [m, p] = await Promise.all([sysAiApi.listModels(), sysAiApi.listProviders()])
      setItems(m); setProviders(p)
    } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])

  const handleDelete = async (m: AIModelRead) => {
    if (!confirm(`Remover o modelo ${m.slug}?`)) return
    try { await sysAiApi.deleteModel(m.id); toast.success('Modelo removido.'); await reload() }
    catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
  }

  const filtered = useMemo(
    () => items.filter(m => !filter || m.slug.includes(filter) || m.displayName.toLowerCase().includes(filter.toLowerCase())),
    [items, filter],
  )

  return (
    <div className="space-y-3">
      <InfoBar>
        Modelos são as "versões" disponíveis de cada provedor (GPT-4o, Claude
        Sonnet, Llama 3.2 etc). Preços em USD por milhão de tokens — ficam
        congelados no histórico de consumo para não bagunçar relatórios
        antigos quando o provedor mudar o valor.
      </InfoBar>

      <div className="flex justify-between items-center gap-3">
        <input placeholder="Buscar por nome..." value={filter}
          onChange={e => setFilter(e.target.value)}
          className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900" />
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 whitespace-nowrap">
          <Plus size={13} /> Novo modelo
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Provedor</th>
                <th className="text-left px-3 py-2">Identificador</th>
                <th className="text-left px-3 py-2">Nome</th>
                <th className="text-left px-3 py-2">Tarefas</th>
                <th className="text-right px-3 py-2" title="Preço por 1 milhão de tokens de entrada">Entrada (USD/1M)</th>
                <th className="text-right px-3 py-2" title="Preço por 1 milhão de tokens de saída">Saída (USD/1M)</th>
                <th className="text-right px-3 py-2" title="Tamanho máximo de contexto">Contexto</th>
                <th className="text-center px-3 py-2">Ativo</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 text-xs">{m.providerSlug}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.slug}</td>
                  <td className="px-3 py-2">{m.displayName}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {m.capabilities.map(c => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" title={c}>
                          {capLabel(c)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatUSD(m.inputCostPerMtok)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatUSD(m.outputCostPerMtok)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {m.maxContext ? `${m.maxContext.toLocaleString('pt-BR')} tokens` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {m.active ? <CheckCircle2 size={14} className="inline text-emerald-500" /> : <XCircle size={14} className="inline text-rose-500" />}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(m)} className="p-1 text-slate-400 hover:text-violet-600" title="Editar"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(m)} className="p-1 text-slate-400 hover:text-rose-600" title="Remover"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ModelEditor providers={providers} initial={editing}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={async () => { setEditing(null); setCreating(false); await reload() }} />
      )}
    </div>
  )
}

function ModelEditor({
  providers, initial, onClose, onSaved,
}: {
  providers: AIProviderRead[]; initial: AIModelRead | null
  onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<AIModelWrite>({
    providerId: initial?.providerId ?? providers[0]?.id ?? '',
    slug: initial?.slug ?? '',
    displayName: initial?.displayName ?? '',
    capabilities: initial?.capabilities ?? [],
    inputCostPerMtok: initial?.inputCostPerMtok ?? 0,
    outputCostPerMtok: initial?.outputCostPerMtok ?? 0,
    maxContext: initial?.maxContext ?? null,
    active: initial?.active ?? true,
  })
  const [saving, setSaving] = useState(false)

  const toggleCap = (c: string) =>
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(c)
        ? f.capabilities.filter(x => x !== c)
        : [...f.capabilities, c],
    }))

  const handleSave = async () => {
    setSaving(true)
    try {
      if (initial) await sysAiApi.updateModel(initial.id, form)
      else await sysAiApi.createModel(form)
      toast.success('Modelo salvo.'); onSaved()
    } catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
    finally { setSaving(false) }
  }

  // UI em USD, salva em centavos.
  const inCostUsd = form.inputCostPerMtok / 100
  const outCostUsd = form.outputCostPerMtok / 100

  return (
    <Modal title={initial ? `Editar modelo: ${initial.slug}` : 'Novo modelo'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <LabeledSelect label="Provedor" value={form.providerId}
            onChange={v => setForm(f => ({ ...f, providerId: v }))}
            options={providers.map(p => ({ value: p.id, label: p.slug }))} />
          <LabeledInput
            label="Identificador do modelo"
            hint="Valor exato exigido pela API do provedor (ex: gpt-4o-mini)."
            value={form.slug}
            onChange={v => setForm(f => ({ ...f, slug: v }))}
            placeholder="gpt-4o-mini" mono
          />
        </div>
        <LabeledInput
          label="Nome para exibir"
          hint="Como aparece nas listas. Ex: GPT-4o mini"
          value={form.displayName}
          onChange={v => setForm(f => ({ ...f, displayName: v }))}
        />
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tarefas que este modelo consegue fazer
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CAPABILITIES.map(c => (
              <button key={c} type="button" onClick={() => toggleCap(c)}
                className={cn('text-xs px-2 py-1 rounded border',
                  form.capabilities.includes(c)
                    ? 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-950/40 dark:border-violet-700'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500')}
              >{capLabel(c)}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <LabeledNumber
            label="Preço entrada (USD/1M)"
            hint="Quanto custam 1 milhão de tokens de entrada."
            value={inCostUsd} step={0.01}
            onChange={v => setForm(f => ({ ...f, inputCostPerMtok: Math.round(v * 100) }))}
          />
          <LabeledNumber
            label="Preço saída (USD/1M)"
            hint="Quanto custam 1 milhão de tokens de resposta."
            value={outCostUsd} step={0.01}
            onChange={v => setForm(f => ({ ...f, outputCostPerMtok: Math.round(v * 100) }))}
          />
          <LabeledNumber
            label="Contexto máximo (tokens)"
            hint="Ex: 128000 para GPT-4o. Deixe 0 se não souber."
            value={form.maxContext ?? 0}
            onChange={v => setForm(f => ({ ...f, maxContext: v || null }))}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
          Modelo habilitado
        </label>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
    </Modal>
  )
}

// ─── Prompts tab ─────────────────────────────────────────────────────────────

function PromptsTab() {
  const [items, setItems] = useState<AIPromptTemplateRead[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AIPromptTemplateRead | null>(null)

  const reload = async () => {
    setLoading(true)
    try { setItems(await sysAiApi.listPrompts()) }
    finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])

  return (
    <div className="space-y-3">
      <InfoBar warn>
        Cada instrução (prompt) diz como a IA deve executar uma tarefa.
        Por enquanto, as instruções reais ficam no código — esta tela serve
        apenas para registrar e auditar versões.
      </InfoBar>

      {loading ? <Spinner /> : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
          {items.map(p => (
            <div key={p.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{p.slug}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">versão {p.version}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{p.description || 'Sem descrição.'}</p>
                </div>
                <button onClick={() => setEditing(p)} className="p-1 text-slate-400 hover:text-violet-600" title="Editar">
                  <Edit3 size={14} />
                </button>
              </div>
              <pre className="mt-3 text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded max-h-40 overflow-auto whitespace-pre-wrap">{p.body}</pre>
            </div>
          ))}
          {items.length === 0 && <div className="py-6 text-center text-slate-400 text-sm">Nenhuma instrução cadastrada.</div>}
        </div>
      )}

      {editing && (
        <PromptEditor initial={editing} onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload() }} />
      )}
    </div>
  )
}

function PromptEditor({
  initial, onClose, onSaved,
}: { initial: AIPromptTemplateRead; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AIPromptTemplateWrite>({
    slug: initial.slug, version: initial.version, body: initial.body,
    description: initial.description, active: initial.active,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await sysAiApi.updatePrompt(initial.id, form)
      toast.success('Prompt salvo.'); onSaved()
    } catch (e) { toast.error('Falha', e instanceof HttpError ? e.message : 'Erro.') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`${initial.slug} · versão ${initial.version}`} onClose={onClose}>
      <div className="space-y-3">
        <LabeledInput
          label="Descrição curta"
          hint="Explica pra que serve essa instrução."
          value={form.description ?? ''}
          onChange={v => setForm(f => ({ ...f, description: v }))}
        />
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Texto da instrução
          </label>
          <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            className="mt-1 w-full text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            rows={14} />
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
    </Modal>
  )
}

// ─── UI shared ──────────────────────────────────────────────────────────────

function InfoBar({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div className={cn(
      'flex items-start gap-2 p-3 rounded-lg border text-xs',
      warn
        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200'
        : 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/50 text-violet-900 dark:text-violet-200',
    )}>
      <AlertCircle size={13} className="shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  )
}

function Spinner() {
  return (
    <div className="py-12 text-center text-sm text-slate-500">
      <Loader2 className="inline animate-spin" size={15} /> Carregando...
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'rose' | 'violet' }) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      accent === 'emerald' && 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20',
      accent === 'rose'    && 'border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20',
      accent === 'violet'  && 'border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20',
      !accent              && 'border-slate-200 dark:border-slate-800',
    )}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-1 font-mono">{value}</p>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({ onClose, onSave, saving }: { onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
      <button onClick={onClose} className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
        Cancelar
      </button>
      <button onClick={onSave} disabled={saving}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-60">
        {saving ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : <><Save size={13} /> Salvar</>}
      </button>
    </div>
  )
}

function LabeledInput({
  label, value, onChange, placeholder, readOnly, mono, hint,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; readOnly?: boolean; mono?: boolean; hint?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly}
        className={cn('mt-1 w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
          mono && 'font-mono', readOnly && 'opacity-70 cursor-not-allowed')} />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function LabeledNumber({
  label, value, onChange, hint, step,
}: {
  label: string; value: number; onChange: (v: number) => void
  hint?: string; step?: number
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      <input type="number" value={value} step={step}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function LabeledSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
