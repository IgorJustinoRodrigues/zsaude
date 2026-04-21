// Tela de pareamento mostrada enquanto o device não tem ``deviceToken``.
// - Ao montar: chama POST /public/devices/register e guarda deviceId no store.
// - Enquanto pending: exibe o código em letra grande e faz polling cada 2s.
// - Quando paired: guarda o token no store (completePairing).

import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing, Loader2, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { devicesApi, type DeviceType } from '../../api/devices'
import { useDeviceStore } from '../../store/deviceStore'

const POLL_INTERVAL_MS = 2_000

interface Props { type: DeviceType }

export function DevicePairingScreen({ type }: Props) {
  const { deviceId, beginPairing, completePairing, reset } = useDeviceStore()
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Registra ao montar (se ainda não tem deviceId ou se expirou).
  const register = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await devicesApi.register(type)
      beginPairing(res.deviceId, type)
      setCode(res.pairingCode)
      setExpiresAt(new Date(res.pairingExpiresAt))
    } catch (e) {
      setError('Falha ao contatar o servidor. Tente novamente.')
      void e
    } finally {
      setLoading(false)
    }
  }, [type, beginPairing])

  useEffect(() => {
    // Se já tem deviceId e code não carregou ainda, faz polling com ele
    // (talvez a tela foi recarregada no meio do pareamento).
    if (!deviceId) void register()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling enquanto pending.
  const pollingRef = useRef<number | null>(null)
  useEffect(() => {
    if (!deviceId) return
    const tick = async () => {
      try {
        const res = await devicesApi.pollStatus(deviceId)
        if (res.status === 'paired' && res.deviceToken) {
          completePairing(res.deviceToken, res.name, res.facilityId)
          return // para o polling
        }
        if (res.status === 'revoked' || res.status === 'stale') {
          // Código expirou ou foi revogado — reseta e pede novo.
          reset()
          setCode(null)
          setExpiresAt(null)
          void register()
          return
        }
      } catch {
        // ignora falhas temporárias — o próximo tick tenta de novo
      }
      pollingRef.current = window.setTimeout(tick, POLL_INTERVAL_MS)
    }
    pollingRef.current = window.setTimeout(tick, POLL_INTERVAL_MS)
    return () => {
      if (pollingRef.current) window.clearTimeout(pollingRef.current)
    }
  }, [deviceId, completePairing, reset, register])

  const Icon = type === 'totem' ? MonitorSmartphone : BellRing

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
      <div className="max-w-md w-full">
        <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-300 flex items-center justify-center mx-auto mb-5">
          <Icon size={28} />
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
          {type === 'totem' ? 'Totem' : 'Painel de chamadas'}
        </p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          Parear este dispositivo
        </h1>

        {loading && !code && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
            <Loader2 size={16} className="animate-spin" /> Preparando…
          </div>
        )}

        {error && (
          <div className="mb-4">
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
            <button
              type="button"
              onClick={() => void register()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
            >
              <RefreshCw size={14} /> Tentar de novo
            </button>
          </div>
        )}

        {code && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              No sistema, entre com um usuário da unidade e informe o código abaixo
              em <span className="font-semibold">Dispositivos</span>.
            </p>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-8 mb-5">
              <p className="text-6xl sm:text-7xl font-black tracking-[0.15em] tabular-nums text-teal-600 dark:text-teal-300 select-all">
                {code}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" />
              Aguardando pareamento…
            </div>
            {expiresAt && (
              <p className="text-[11px] text-slate-400 mt-2">
                Expira às {expiresAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
