import { useEffect, useState } from 'react'
import { Database, Save, AlertCircle, Loader2, Info } from 'lucide-react'
import { sysApi } from '../../api/sys'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'

interface CadsusBaseValue {
  user?: string
  password?: string
  url?: string
}

const DEFAULT_URL = 'https://servicos.saude.gov.br/cadsus/PDQSupplier'
const HOM_URL     = 'https://servicoshm.saude.gov.br/cadsus/PDQSupplier'

/**
 * Configuração da base geral da integração CadSUS. Fallback usado quando
 * um município não tem credenciais próprias configuradas em /sys/municipios.
 */
export function SysCadsusPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [user, setUser] = useState('')
  const [url, setUrl]   = useState(DEFAULT_URL)
  const [passwordSet, setPasswordSet] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState<string | null>(null)

  useEffect(() => {
    sysApi.getSetting('cadsus.base')
      .then(s => {
        const v = (s.value ?? {}) as CadsusBaseValue
        setUser(v.user ?? '')
        setUrl(v.url || DEFAULT_URL)
        setPasswordSet(!!v.password)
      })
      .catch(e => {
        setError(e instanceof HttpError ? e.message : 'Erro ao carregar.')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      // Se o user não mexeu na senha, preserva a atual (busca primeiro).
      let currentPass = ''
      if (passwordDraft === null) {
        const current = await sysApi.getSetting('cadsus.base')
        currentPass = ((current.value ?? {}) as CadsusBaseValue).password ?? ''
      }
      await sysApi.updateSetting('cadsus.base', {
        user: user.trim(),
        password: passwordDraft !== null ? passwordDraft : currentPass,
        url: url.trim() || DEFAULT_URL,
      })
      setPasswordSet(passwordDraft !== null
        ? passwordDraft.length > 0
        : currentPass.length > 0)
      setPasswordDraft(null)
      toast.success('Configuração do CadSUS atualizada.')
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao salvar.'
      setError(msg)
      toast.error('Falha ao salvar', msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-slate-500">Carregando...</div>
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <Database size={18} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              Integração CadSUS
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Credenciais base (usadas quando o município não define as suas).
            </p>
          </div>
        </div>
      </header>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/50 text-xs text-violet-900 dark:text-violet-200">
          <Info size={13} className="shrink-0 mt-0.5" />
          <p>
            O sistema usa primeiro as credenciais do município ativo. Se estiverem em
            branco, cai pra estas aqui. Se ambas vazias, a busca no CadSUS é desativada
            (retorna 503).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Usuário
            </label>
            <input
              value={user}
              onChange={e => setUser(e.target.value)}
              placeholder="CADSUS.SMS.MUNICIPIO.UF"
              className="mt-1 w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Senha
              {passwordSet && passwordDraft === null && (
                <span className="text-emerald-600 dark:text-emerald-400 ml-1">· definida</span>
              )}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="password"
                value={passwordDraft ?? ''}
                onChange={e => setPasswordDraft(e.target.value)}
                placeholder={passwordSet ? '••••••••  (manter a atual)' : 'Defina a senha'}
                className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              {passwordSet && passwordDraft === null && (
                <button
                  type="button"
                  onClick={() => setPasswordDraft('')}
                  className="px-3 py-2 text-xs border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Limpar
                </button>
              )}
            </div>
            {passwordDraft !== null && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                {passwordDraft === ''
                  ? 'A senha será removida ao salvar.'
                  : 'Nova senha será gravada ao salvar.'}
                {' '}
                <button type="button" onClick={() => setPasswordDraft(null)}
                  className="underline hover:no-underline">
                  descartar
                </button>
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            URL do endpoint
          </label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={() => setUrl(DEFAULT_URL)}
              className="text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              Produção
            </button>
            <button type="button" onClick={() => setUrl(HOM_URL)}
              className="text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              Homologação
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-300 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Salvando...</>
              : <><Save size={14} /> Salvar</>}
          </button>
        </div>
      </div>
    </div>
  )
}
