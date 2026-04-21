// Admin de dispositivos da unidade atual: listar, parear, editar vínculo, revogar.

import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  AlertTriangle, BellRing, CheckCircle2, Clock, Copy, Edit3, Loader2,
  MonitorSmartphone, Plug, Plus, Trash2, X,
} from 'lucide-react'
import {
  devicesApi,
  type DeviceListItem,
  type DeviceType,
} from '../../api/devices'
import { painelsApi, type AvailablePainel } from '../../api/painels'
import { totensApi, type AvailableTotem } from '../../api/totens'
import { HttpError } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { confirmDialog } from '../../store/dialogStore'
import { toast } from '../../store/toastStore'
import { PageHeader } from '../../components/shared/PageHeader'
import { cn } from '../../lib/utils'

export function RecDevicesPage() {
  const [items, setItems] = useState<DeviceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pairing, setPairing] = useState(false)
  const [editing, setEditing] = useState<DeviceListItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await devicesApi.list()
      setItems(list)
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao listar dispositivos.'
      toast.error('Erro', msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const active = items.filter(i => i.status === 'paired')
  const revoked = items.filter(i => i.status === 'revoked')

  async function revoke(d: DeviceListItem) {
    const ok = await confirmDialog({
      title: 'Desconectar dispositivo',
      message: `O dispositivo "${d.name ?? 'sem nome'}" será desconectado e precisará ser pareado novamente pra voltar a funcionar.`,
      confirmLabel: 'Desconectar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await devicesApi.revoke(d.id)
      toast.success('Dispositivo desconectado')
      await load()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao desconectar.'
      toast.error('Erro', msg)
    }
  }

  return (
    <div>
      <PageHeader
        title="Dispositivos"
        subtitle="Totens e painéis conectados a esta unidade"
        actions={
          <button
            type="button"
            onClick={() => setPairing(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors"
          >
            <Plus size={14} /> Parear dispositivo
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="text-slate-400 animate-spin" />
        </div>
      ) : active.length === 0 ? (
        <div className="bg-card border border-border border-dashed rounded-xl p-10 text-center">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Plug size={18} />
          </div>
          <p className="text-sm text-muted-foreground">Nenhum dispositivo conectado.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Abra <span className="font-mono">/dispositivo/totem</span> ou <span className="font-mono">/dispositivo/painel</span> no equipamento e informe aqui o código exibido.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map(d => (
            <DeviceRow
              key={d.id}
              device={d}
              onEdit={() => setEditing(d)}
              onRevoke={() => revoke(d)}
            />
          ))}
        </ul>
      )}

      {revoked.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Revogados (últimos 30 dias)
          </h2>
          <ul className="space-y-1">
            {revoked.map(d => (
              <li key={d.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3 text-xs text-muted-foreground opacity-70">
                <Icon type={d.type} muted />
                <span className="flex-1 truncate">{d.name ?? 'sem nome'} · {d.type}</span>
                <span>revogado {d.revokedAt ? new Date(d.revokedAt).toLocaleDateString('pt-BR') : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pairing && (
        <PairModal
          onClose={() => setPairing(false)}
          onPaired={async () => { setPairing(false); await load() }}
        />
      )}

      {editing && (
        <EditDeviceModal
          device={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      )}
    </div>
  )
}

// ─── Linha ──────────────────────────────────────────────────────────────────

function DeviceRow({
  device, onEdit, onRevoke,
}: { device: DeviceListItem; onEdit: () => void; onRevoke: () => void }) {
  const linkedName = device.type === 'painel' ? device.painelName : device.totemName
  const linked = !!(device.type === 'painel' ? device.painelId : device.totemId)

  return (
    <li className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <Icon type={device.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate">{device.name ?? 'Sem nome'}</p>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 text-[10px] font-semibold uppercase tracking-wider">
            <CheckCircle2 size={10} /> Conectado
          </span>
          {linked ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[10px] font-semibold uppercase tracking-wider">
              {device.type === 'painel' ? <BellRing size={10} /> : <MonitorSmartphone size={10} />}
              {linkedName}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-semibold uppercase tracking-wider">
              <AlertTriangle size={10} /> Não configurado
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {device.type === 'totem' ? 'Totem' : 'Painel'}
          {device.pairedByUserName && ` · pareado por ${device.pairedByUserName}`}
          {device.pairedAt && ` · ${new Date(device.pairedAt).toLocaleDateString('pt-BR')}`}
        </p>
        {device.lastSeenAt && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock size={11} /> visto por último: {new Date(device.lastSeenAt).toLocaleString('pt-BR')}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Edit3 size={13} /> Editar
      </button>
      <button
        type="button"
        onClick={onRevoke}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
      >
        <Trash2 size={13} /> Desconectar
      </button>
    </li>
  )
}

function Icon({ type, muted }: { type: DeviceType; muted?: boolean }) {
  const I = type === 'totem' ? MonitorSmartphone : BellRing
  return (
    <div className={cn(
      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
      muted
        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
        : 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-300',
    )}>
      <I size={18} />
    </div>
  )
}

// ─── Hook pra listas disponíveis ────────────────────────────────────────────

function useAvailableConfigs(type: DeviceType) {
  const [painels, setPainels] = useState<AvailablePainel[]>([])
  const [totens, setTotens] = useState<AvailableTotem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const p = type === 'painel' ? painelsApi.available() : Promise.resolve([])
    const t = type === 'totem' ? totensApi.available() : Promise.resolve([])
    Promise.all([p, t])
      .then(([ps, ts]) => {
        if (cancelled) return
        setPainels(ps as AvailablePainel[])
        setTotens(ts as AvailableTotem[])
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [type])

  return { painels, totens, loading }
}

// ─── Dropdown de config ─────────────────────────────────────────────────────

interface ConfigPickerProps {
  type: DeviceType
  value: string | null
  onChange: (id: string | null) => void
  painels: AvailablePainel[]
  totens: AvailableTotem[]
  loading: boolean
  stepLabel?: string
}

function ConfigPicker({ type, value, onChange, painels, totens, loading, stepLabel }: ConfigPickerProps) {
  const items = type === 'painel'
    ? painels.filter(p => !p.archived).map(p => ({ id: p.id, label: p.name, inherited: p.inherited }))
    : totens.filter(t => !t.archived).map(t => ({ id: t.id, label: t.name, inherited: t.inherited }))

  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
        {stepLabel ?? ''}{type === 'painel' ? 'Painel' : 'Totem'} vinculado (opcional)
      </label>
      {loading ? (
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Carregando…
        </div>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Não há {type === 'painel' ? 'painéis' : 'totens'} cadastrados — o dispositivo ficará "Aguardando configuração".
          Cadastre em <span className="font-mono">Recursos → {type === 'painel' ? 'Painéis' : 'Totens'}</span>.
        </p>
      ) : (
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">— Aguardando configuração (escolher depois) —</option>
          {items.map(it => (
            <option key={it.id} value={it.id}>
              {it.label}{it.inherited ? ' (do município)' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

// ─── Modal de pareamento ────────────────────────────────────────────────────

function PairModal({
  onClose, onPaired,
}: { onClose: () => void; onPaired: () => Promise<void> }) {
  const { context } = useAuthStore()
  const [code, setCode] = useState('')
  const [type, setType] = useState<DeviceType>('painel')
  const [name, setName] = useState('')
  const [configId, setConfigId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { painels, totens, loading: loadingConfigs } = useAvailableConfigs(type)

  // URL do device — depende do tipo escolhido. Usa o origin da janela
  // atual (funciona em dev local e produção).
  const deviceUrl = `${window.location.origin}/dispositivo/${type}`

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(deviceUrl)
      toast.success('URL copiada')
    } catch {
      toast.error('Copiar', 'Não foi possível copiar — copie manualmente.')
    }
  }

  // Ao trocar o tipo, zera a seleção (painéis e totens não se misturam).
  useEffect(() => { setConfigId(null) }, [type])

  async function submit() {
    if (!context) return
    setSaving(true)
    try {
      await devicesApi.pair({
        code: code.trim().toUpperCase(),
        type,
        name: name.trim(),
        facilityId: context.facility.id,
        painelId: type === 'painel' ? configId : undefined,
        totemId: type === 'totem' ? configId : undefined,
      })
      toast.success('Dispositivo pareado')
      await onPaired()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha no pareamento.'
      toast.error('Erro', msg)
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = code.trim().length >= 4 && name.trim().length > 0 && !saving

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-sm font-semibold">Parear dispositivo</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 block">
              Tipo
            </label>
            <div className="flex gap-2">
              {(['painel', 'totem'] as DeviceType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors capitalize',
                    type === t
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200',
                  )}
                >
                  {t === 'totem' ? 'Totem' : 'Painel'}
                </button>
              ))}
            </div>
          </div>

          {/* QR + URL do device */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-3">
              1. No dispositivo, abra a URL abaixo (ou aponte a câmera pro QR):
            </p>
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg shrink-0">
                <QRCodeSVG value={deviceUrl} size={112} level="M" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <code className="block text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 break-all text-slate-700 dark:text-slate-200">
                  {deviceUrl}
                </code>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Copy size={12} /> Copiar URL
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              2. Código que aparecer no dispositivo
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF"
              maxLength={10}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xl tracking-[0.2em] uppercase focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              3. Nome (apelido do hardware)
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Totem do balcão, TV da triagem"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />
          </div>

          <ConfigPicker
            type={type}
            value={configId}
            onChange={setConfigId}
            painels={painels}
            totens={totens}
            loading={loadingConfigs}
            stepLabel="4. "
          />

          <p className="text-[11px] text-muted-foreground">
            Vai ser vinculado à unidade <strong>{context?.facility.shortName}</strong>.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
            Parear
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal editar dispositivo ───────────────────────────────────────────────

function EditDeviceModal({
  device, onClose, onSaved,
}: {
  device: DeviceListItem
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(device.name ?? '')
  const initialConfig = device.type === 'painel' ? device.painelId : device.totemId
  const [configId, setConfigId] = useState<string | null>(initialConfig)
  const [saving, setSaving] = useState(false)

  const { painels, totens, loading } = useAvailableConfigs(device.type)

  async function submit() {
    setSaving(true)
    try {
      const payload: {
        name?: string; painelId?: string | null; totemId?: string | null
      } = {}
      if (name.trim() !== (device.name ?? '')) payload.name = name.trim()
      if (device.type === 'painel') payload.painelId = configId
      else payload.totemId = configId
      await devicesApi.update(device.id, payload)
      toast.success('Dispositivo atualizado')
      await onSaved()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao atualizar.'
      toast.error('Erro', msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Editar dispositivo</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
              autoFocus
            />
          </div>

          <ConfigPicker
            type={device.type}
            value={configId}
            onChange={setConfigId}
            painels={painels}
            totens={totens}
            loading={loading}
          />

          <p className="text-[11px] text-muted-foreground">
            A troca de vínculo aplica quase instantaneamente no dispositivo — ele pega a config nova no próximo polling.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
