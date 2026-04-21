// Tela de pareamento mostrada enquanto o device não tem ``deviceToken``.
// - Ao montar: chama POST /public/devices/register e guarda deviceId no store.
// - Enquanto pending: exibe o código em letra grande e faz polling cada 2s.
// - Quando paired: guarda o token no store (completePairing).

import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { BellRing, Loader2, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { HttpError } from '../../api/client'
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
    // Sempre registra no mount — descarta deviceId antigo (pode ser de
    // um device revogado/deletado; o código é ephemeral no backend e
    // não persistimos no front, então não dá pra recuperar mesmo).
    void register()
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
      } catch (e) {
        // Device não existe mais no backend (404) — re-registra.
        if (e instanceof HttpError && e.status === 404) {
          reset()
          setCode(null)
          setExpiresAt(null)
          void register()
          return
        }
        // Outros erros: ignora — próximo tick tenta de novo.
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
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-3xl w-full">
        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-300 flex items-center justify-center mx-auto mb-3">
            <Icon size={24} />
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-1">
            {type === 'totem' ? 'Totem' : 'Painel de chamadas'}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Parear este dispositivo
          </h1>
        </div>

        {loading && !code && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-12">
            <Loader2 size={16} className="animate-spin" /> Preparando…
          </div>
        )}

        {error && (
          <div className="max-w-sm mx-auto text-center">
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
            {/* Card único: QR grande à esquerda, código + instruções à direita */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 sm:gap-10">
              <div className="bg-white p-3 rounded-xl shrink-0">
                <QRCodeSVG
                  value={`${window.location.origin}/dispositivos/parear?code=${code}&type=${type}`}
                  size={220}
                  level="M"
                />
              </div>
              <div className="flex-1 min-w-0 text-center md:text-left">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-1">
                  Código
                </p>
                <p className="text-5xl sm:text-6xl font-black tracking-[0.15em] tabular-nums text-teal-600 dark:text-teal-300 select-all leading-none mb-5">
                  {code}
                </p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Aponte o celular pro QR pra parear com um clique —
                  ou digite o código no sistema em{' '}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Recepção → Dispositivos
                  </span>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mt-5">
              <Loader2 size={12} className="animate-spin" />
              Aguardando pareamento…
              {expiresAt && (
                <span className="text-slate-400">
                  · expira às {expiresAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
