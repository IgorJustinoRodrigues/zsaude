import { useEffect, useState } from 'react'
import { Settings, Check, AlertCircle } from 'lucide-react'
import { sysApi, type SystemSetting } from '../../api/sys'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'

export function SysSettingsPage() {
  const [items, setItems] = useState<SystemSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [okKey, setOkKey] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    sysApi.listSettings()
      .then(list => {
        setItems(list)
        setDrafts(Object.fromEntries(list.map(s => [s.key, JSON.stringify(s.value)])))
      })
      .catch(e => {
        const msg = e instanceof HttpError ? e.message : 'Erro ao carregar.'
        setError(msg)
        toast.error('Falha ao carregar configurações', msg)
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const save = async (key: string) => {
    setSavingKey(key); setError('')
    try {
      const raw = drafts[key]
      let value: unknown
      try { value = JSON.parse(raw) } catch { value = raw }
      const updated = await sysApi.updateSetting(key, value)
      setItems(prev => prev.map(s => s.key === key ? updated : s))
      setOkKey(key)
      toast.success('Configuração atualizada', key)
      setTimeout(() => setOkKey(null), 1600)
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao salvar.'
      setError(msg)
      toast.error('Falha ao atualizar configuração', msg)
    } finally { setSavingKey(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Settings size={20} className="text-violet-500" />
          Configurações do sistema
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Valores globais que regem o comportamento da plataforma. Altere com cautela — alguns impactam sessões e segurança.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {items.map(s => (
          <div key={s.key} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono">{s.key}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 sm:w-80">
              <input
                value={drafts[s.key] ?? ''}
                onChange={e => setDrafts(d => ({ ...d, [s.key]: e.target.value }))}
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200"
              />
              <button
                onClick={() => save(s.key)}
                disabled={savingKey === s.key || drafts[s.key] === JSON.stringify(s.value)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {okKey === s.key ? <Check size={12} /> : 'Salvar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">
        Valores são JSON: strings entre aspas (<code>"pt-BR"</code>), números sem aspas (<code>15</code>), booleanos (<code>true</code>/<code>false</code>).
      </p>
    </div>
  )
}
