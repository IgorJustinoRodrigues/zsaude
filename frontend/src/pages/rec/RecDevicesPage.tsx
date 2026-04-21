// Admin de dispositivos da unidade atual: listar, parear e revogar.

import { useCallback, useEffect, useState } from 'react'
import {
  BellRing, CheckCircle2, Clock, Loader2, MonitorSmartphone, Plug,
  Plus, Trash2, X,
} from 'lucide-react'
import { devicesApi, type DeviceListItem, type DeviceType } from '../../api/devices'
import { HttpError } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/toastStore'
import { PageHeader } from '../../components/shared/PageHeader'
import { cn } from '../../lib/utils'

export function RecDevicesPage() {
  const [items, setItems] = useState<DeviceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pairing, setPairing] = useState(false)

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

  async function revoke(id: string, name: string | null) {
    if (!confirm(`Desconectar "${name ?? 'dispositivo sem nome'}"?`)) return
    try {
      await devicesApi.revoke(id)
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
            <DeviceRow key={d.id} device={d} onRevoke={() => revoke(d.id, d.name)} />
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
    </div>
  )
}

// ─── Linha ──────────────────────────────────────────────────────────────────

function DeviceRow({
  device, onRevoke,
}: { device: DeviceListItem; onRevoke: () => void }) {
  return (
    <li className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <Icon type={device.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate">{device.name ?? 'Sem nome'}</p>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 text-[10px] font-semibold uppercase tracking-wider">
            <CheckCircle2 size={10} /> Conectado
          </span>
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

// ─── Modal de pareamento ────────────────────────────────────────────────────

function PairModal({
  onClose, onPaired,
}: { onClose: () => void; onPaired: () => Promise<void> }) {
  const { context } = useAuthStore()
  const [code, setCode] = useState('')
  const [type, setType] = useState<DeviceType>('totem')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!context) return
    setSaving(true)
    try {
      await devicesApi.pair({
        code: code.trim().toUpperCase(),
        type,
        name: name.trim(),
        facilityId: context.facility.id,
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Parear dispositivo</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Código exibido no dispositivo
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
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 block">
              Tipo
            </label>
            <div className="flex gap-2">
              {(['totem', 'painel'] as DeviceType[]).map(t => (
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

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Nome (pra identificar)
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Totem do balcão"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            O dispositivo será vinculado à unidade <strong>{context?.facility.shortName}</strong>.
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
