import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToastStore, type Toast, type ToastType } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const TYPE_META: Record<ToastType, { icon: React.ReactNode; color: string; ring: string }> = {
  success: {
    icon: <CheckCircle2 size={16} />,
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60',
    ring:  'ring-emerald-200 dark:ring-emerald-900',
  },
  error: {
    icon: <AlertCircle size={16} />,
    color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60',
    ring:  'ring-red-200 dark:ring-red-900',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60',
    ring:  'ring-amber-200 dark:ring-amber-900',
  },
  info: {
    icon: <Info size={16} />,
    color: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60',
    ring:  'ring-sky-200 dark:ring-sky-900',
  },
}

export function Toaster() {
  const toasts = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const meta = TYPE_META[toast.type]
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-start gap-3 w-full',
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
        'rounded-xl shadow-lg ring-1',
        meta.ring,
        'p-3 animate-[slideIn_200ms_ease-out]',
      )}
      style={{
        animation: 'slideIn 200ms ease-out',
      }}
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', meta.color)}>
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  )
}
