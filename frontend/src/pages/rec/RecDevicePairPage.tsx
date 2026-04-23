// Página de pareamento via QR — abre quando alguém escaneia o QR do
// device com o celular logado. Lê ?code=X&type=Y da URL, mostra um
// formulário curto (nome + vínculo opcional) e confirma direto.

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BellRing, CheckCircle2, Loader2, LogIn, MonitorSmartphone, Plug,
  UserCheck,
} from 'lucide-react'
import { devicesApi, type DeviceType } from '../../api/devices'
import { painelsApi, type AvailablePainel } from '../../api/painels'
import { totensApi, type AvailableTotem } from '../../api/totens'
import { HttpError } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/toastStore'
import { BrandName } from '../../components/shared/BrandName'
import { cn } from '../../lib/utils'

export function RecDevicePairPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { accessToken, user, context } = useAuthStore()

  const codeRaw = (params.get('code') ?? '').toUpperCase().trim()
  const typeRaw = (params.get('type') ?? '') as DeviceType
  const type: DeviceType | null = typeRaw === 'painel' || typeRaw === 'totem' ? typeRaw : null
  const isLoggedIn = !!(accessToken && user)
  // URL pra preservar onde voltar após login/context select.
  const returnTo = `/dispositivos/parear?code=${codeRaw}&type=${type ?? ''}`

  const [name, setName] = useState('')
  const [configId, setConfigId] = useState<string | null>(null)
  const [painels, setPainels] = useState<AvailablePainel[]>([])
  const [totens, setTotens] = useState<AvailableTotem[]>([])
  const [loadingConfigs, setLoadingConfigs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!type) { setLoadingConfigs(false); return }
    let cancelled = false
    const p = type === 'painel' ? painelsApi.available() : Promise.resolve([])
    const t = type === 'totem' ? totensApi.available() : Promise.resolve([])
    Promise.all([p, t])
      .then(([ps, ts]) => {
        if (cancelled) return
        setPainels(ps as AvailablePainel[])
        setTotens(ts as AvailableTotem[])
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancelled) setLoadingConfigs(false) })
    return () => { cancelled = true }
  }, [type])

  // Parâmetros inválidos na URL
  if (!codeRaw || !type) {
    return (
      <PageFrame>
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-sm text-red-500">Link de pareamento inválido.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Abra o QR code na tela do dispositivo e tente novamente.
          </p>
        </div>
      </PageFrame>
    )
  }

  // Não logado: mensagem amigável + link pra login preservando returnTo
  if (!isLoggedIn) {
    return (
      <PageFrame>
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto mb-4">
            <UserCheck size={24} />
          </div>
          <h1 className="text-base font-bold mb-2">Precisa estar logado</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Pra parear o dispositivo, entre com um usuário que tenha acesso à unidade onde o equipamento vai ficar. Depois do login a gente te traz de volta pra concluir.
          </p>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 mb-4 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Código</span>
            <span className="font-mono text-base tracking-[0.2em] font-bold">{codeRaw}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login', { state: { returnTo } })}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
          >
            <LogIn size={16} />
            Entrar para continuar
          </button>
        </div>
      </PageFrame>
    )
  }

  // Falta de work context: pede pra selecionar unidade
  if (!context) {
    return (
      <PageFrame>
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-sm">Você precisa selecionar uma unidade primeiro.</p>
          <button
            type="button"
            onClick={() => navigate('/selecionar-acesso', { state: { returnTo } })}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
          >
            Escolher unidade
          </button>
        </div>
      </PageFrame>
    )
  }

  async function submit() {
    if (!type || !context) return
    setSaving(true)
    try {
      await devicesApi.pair({
        code: codeRaw,
        type,
        name: name.trim() || `${type === 'painel' ? 'Painel' : 'Totem'} sem nome`,
        facilityId: context.facility.id,
        painelId: type === 'painel' ? configId : undefined,
        totemId: type === 'totem' ? configId : undefined,
      })
      setDone(true)
      toast.success('Dispositivo pareado', 'Pode voltar pra tela do dispositivo.')
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha no pareamento.'
      toast.error('Erro', msg)
    } finally {
      setSaving(false)
    }
  }

  const TypeIcon = type === 'painel' ? BellRing : MonitorSmartphone
  const items = type === 'painel'
    ? painels.filter(p => !p.archived).map(p => ({ id: p.id, label: p.name, inherited: p.inherited }))
    : totens.filter(t => !t.archived).map(t => ({ id: t.id, label: t.name, inherited: t.inherited }))

  if (done) {
    return (
      <PageFrame>
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-500/20 text-teal-600 dark:text-teal-300 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="text-lg font-bold mb-2">Dispositivo pareado</h1>
          <p className="text-sm text-muted-foreground mb-4">
            O {type === 'painel' ? 'painel' : 'totem'} "{name || 'sem nome'}" foi vinculado à unidade
            {' '}<strong>{context.facility.shortName}</strong>.
          </p>
          <button
            type="button"
            onClick={() => navigate('/rec/dispositivos')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
          >
            Ver dispositivos
          </button>
        </div>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-300 flex items-center justify-center shrink-0">
            <TypeIcon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Pareamento de dispositivo</p>
            <h1 className="text-base font-semibold truncate">
              {type === 'painel' ? 'Painel de chamadas' : 'Totem'}
            </h1>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Código</span>
          <span className="font-mono text-lg tracking-[0.2em] font-bold text-slate-800 dark:text-slate-100">
            {codeRaw}
          </span>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
            Nome (apelido do hardware)
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={type === 'painel' ? 'Ex: TV da entrada' : 'Ex: Totem do balcão'}
            maxLength={120}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
            {type === 'painel' ? 'Painel' : 'Totem'} vinculado (opcional)
          </label>
          {loadingConfigs ? (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Carregando…
            </div>
          ) : items.length === 0 ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Não há {type === 'painel' ? 'painéis' : 'totens'} cadastrados —
              o dispositivo ficará "Aguardando configuração".
            </p>
          ) : (
            <select
              value={configId ?? ''}
              onChange={e => setConfigId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">— Escolher depois —</option>
              {items.map(it => (
                <option key={it.id} value={it.id}>
                  {it.label}{it.inherited ? ' (do município)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Vai ser vinculado à unidade <strong>{context.facility.shortName}</strong>.
        </p>

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold text-white transition-colors',
            'bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
          Confirmar pareamento
        </button>
      </div>
    </PageFrame>
  )
}

// ─── Shell mínimo (rota fora do AppShell) ────────────────────────────────────

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-5 sm:p-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-center mb-5">
          <BrandName
            accentClassName="text-teal-500"
            className="text-lg font-bold text-slate-900 dark:text-white"
          />
        </div>
        {children}
      </div>
    </div>
  )
}
