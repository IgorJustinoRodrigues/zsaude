import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, AlertCircle, AlertTriangle, CheckCircle, Info, ExternalLink, ArrowRight,
} from 'lucide-react'
import {
  notificationsApi,
  type NotificationDetailItem,
  type NotificationType,
} from '../../api/notifications'
import { useNotificationStore } from '../../store/notificationStore'
import { cn } from '../../lib/utils'

const TYPE_META: Record<NotificationType, { icon: React.ReactNode; label: string; color: string; ring: string }> = {
  error:   { icon: <AlertCircle size={18} />,    label: 'Erro',    color: 'text-rose-600',  ring: 'ring-rose-100 dark:ring-rose-950/40 bg-rose-50 dark:bg-rose-950/30' },
  warning: { icon: <AlertTriangle size={18} />,  label: 'Aviso',   color: 'text-amber-600', ring: 'ring-amber-100 dark:ring-amber-950/40 bg-amber-50 dark:bg-amber-950/30' },
  success: { icon: <CheckCircle size={18} />,    label: 'Sucesso', color: 'text-emerald-600', ring: 'ring-emerald-100 dark:ring-emerald-950/40 bg-emerald-50 dark:bg-emerald-950/30' },
  info:    { icon: <Info size={18} />,           label: 'Info',    color: 'text-sky-600',    ring: 'ring-sky-100 dark:ring-sky-950/40 bg-sky-50 dark:bg-sky-950/30' },
}

function isExternal(url: string): boolean {
  return /^(https?:)?\/\//i.test(url)
}

interface Props {
  notificationId: string | null
  onClose: () => void
}

export function NotificationDetailModal({ notificationId, onClose }: Props) {
  const navigate = useNavigate()
  const markRead = useNotificationStore(s => s.markRead)
  const [detail, setDetail] = useState<NotificationDetailItem | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!notificationId) { setDetail(null); return }
    setLoading(true)
    notificationsApi.detail(notificationId)
      .then(d => {
        setDetail(d)
        // Marca como lida ao abrir o detalhe (comportamento Gmail-like).
        if (!d.read) void markRead(d.id)
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [notificationId, markRead])

  useEffect(() => {
    if (!notificationId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [notificationId, onClose])

  if (!notificationId) return null

  const meta = detail ? TYPE_META[detail.type] : TYPE_META.info
  const handleAction = () => {
    if (!detail?.actionUrl) return
    if (isExternal(detail.actionUrl)) {
      window.open(detail.actionUrl, '_blank', 'noopener,noreferrer')
    } else {
      navigate(detail.actionUrl)
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className={cn('w-11 h-11 rounded-full flex items-center justify-center shrink-0 ring-4', meta.ring, meta.color)}>
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <p className="text-sm text-slate-400">Carregando…</p>
            ) : detail ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {meta.label}
                </p>
                <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug mt-0.5">
                  {detail.title}
                </h2>
              </>
            ) : (
              <p className="text-sm text-rose-500">Não foi possível carregar.</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {detail && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {detail.message}
            </p>
            {detail.body && (
              <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap border-t border-slate-100 dark:border-slate-800 pt-4">
                {detail.body}
              </div>
            )}

            {/* Metadata */}
            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
              <p>
                {new Date(detail.createdAt).toLocaleString('pt-BR', {
                  dateStyle: 'short', timeStyle: 'short',
                })}
              </p>
              {detail.createdByName && <p>Enviado por {detail.createdByName}</p>}
              {detail.scopeLabel && <p>Destinatários: {detail.scopeLabel}</p>}
              {detail.category && detail.category !== 'manual' && (
                <p>Categoria: <code className="text-[10px]">{detail.category}</code></p>
              )}
            </div>
          </div>
        )}

        {/* Action */}
        {detail?.actionUrl && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Fechar
            </button>
            <button
              onClick={handleAction}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold"
            >
              {detail.actionLabel || 'Abrir'}
              {isExternal(detail.actionUrl) ? <ExternalLink size={14} /> : <ArrowRight size={14} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
