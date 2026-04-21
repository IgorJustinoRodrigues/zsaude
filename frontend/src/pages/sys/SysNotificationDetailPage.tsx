import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, Clock, Megaphone, Search, Users, MapPin,
  Building2, User as UserIcon,
} from 'lucide-react'
import {
  notificationsAdminApi,
  type BroadcastDetail,
} from '../../api/notifications'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ExportMenuButton } from '../../components/ui/ExportMenuButton'
import { useBranding } from '../../hooks/useBranding'
import type { ExportOptions } from '../../lib/export'

type RecipientRow = {
  userName: string
  readAt: string | null
  status: string  // 'Lido' | 'Não lido'
  readAtLabel: string
}

export function SysNotificationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<BroadcastDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all')
  const [search, setSearch] = useState('')
  const branding = useBranding()

  useEffect(() => {
    if (!id) return
    setLoading(true)
    notificationsAdminApi.broadcastDetail(id)
      .then(setDetail)
      .catch(e => toast.error('Falha ao carregar', e instanceof HttpError ? e.message : ''))
      .finally(() => setLoading(false))
  }, [id])

  const rows = useMemo<RecipientRow[]>(
    () => (detail?.recipients ?? []).map(r => ({
      userName: r.userName,
      readAt: r.readAt,
      status: r.readAt ? 'Lido' : 'Não lido',
      readAtLabel: r.readAt
        ? new Date(r.readAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : '—',
    })),
    [detail],
  )

  const filtered = useMemo(
    () => rows.filter(r => {
      const matchFilter = filter === 'all'
        ? true
        : filter === 'read' ? r.readAt !== null : r.readAt === null
      const q = search.trim().toLowerCase()
      return matchFilter && (!q || r.userName.toLowerCase().includes(q))
    }),
    [rows, filter, search],
  )

  const total = detail?.totalRecipients ?? 0
  const readCount = detail?.readCount ?? 0
  const unreadCount = total - readCount
  const pct = total > 0 ? Math.round((readCount / total) * 100) : 0

  const exportOptions = useMemo<ExportOptions<RecipientRow>>(() => ({
    title: `Relatório de envio · ${detail?.title ?? ''}`,
    subtitle: `${readCount} de ${total} leram (${pct}%)`,
    context: detail ? `${detail.scopeLabel} · ${new Date(detail.createdAt).toLocaleString('pt-BR')}` : undefined,
    filename: `notificacao-${(detail?.title ?? 'envio').toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`,
    rows: filtered,
    columns: [
      { header: 'Destinatário', get: r => r.userName, bold: true },
      { header: 'Status',       get: r => r.status, align: 'center', width: 70 },
      { header: 'Lido em',      get: r => r.readAtLabel, align: 'right', width: 110 },
    ],
    rowHighlight: r => r.readAt ? 'emerald' : null,
    branding,
  }), [detail, filtered, readCount, total, pct, branding])

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

  if (!detail) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/sys/notificacoes')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft size={14} />
          Voltar
        </button>
        <p className="text-sm text-rose-500">Envio não encontrado ou sem permissão.</p>
      </div>
    )
  }

  const ScopeIcon = detail.scopeType === 'all' ? Users
    : detail.scopeType === 'municipality' ? MapPin
    : detail.scopeType === 'facility' ? Building2
    : UserIcon

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/sys/notificacoes')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
              <Megaphone size={11} className="text-violet-500" />
              Detalhe do envio
            </p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-snug">
              {detail.title}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <ScopeIcon size={11} />
              {detail.scopeLabel}
              <span className="mx-0.5">·</span>
              {new Date(detail.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              {detail.createdByName && (
                <>
                  <span className="mx-0.5">·</span>
                  por {detail.createdByName}
                </>
              )}
            </p>
          </div>
        </div>
        <ExportMenuButton<RecipientRow>
          options={exportOptions}
          label="Exportar"
          pdfOrientation="portrait"
          className="shrink-0"
        />
      </div>

      {/* Preview do conteúdo enviado */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Conteúdo</p>
        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
          {detail.message}
        </p>
        {detail.body && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
            {detail.body}
          </div>
        )}
        {detail.actionUrl && (
          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            CTA: <code className="text-[10px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
              {detail.actionLabel}
            </code>
            <span className="mx-1">→</span>
            <code className="text-[10px]">{detail.actionUrl}</code>
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Total de destinatários"
          value={total}
          color="bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400"
        />
        <StatCard
          label="Já leram"
          value={readCount}
          suffix={`· ${pct}%`}
          color="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
        />
        <StatCard
          label="Pendentes"
          value={unreadCount}
          color="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
        />
      </div>

      {/* Progresso */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-500">Progresso de leitura</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{pct}%</span>
        </div>
        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar destinatário por nome…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200"
          />
        </div>
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          {([['all', `Todos (${total})`], ['read', `Lidos (${readCount})`], ['unread', `Não lidos (${unreadCount})`]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                filter === v
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">
            Nenhum destinatário combina com o filtro.
          </p>
        ) : (
          filtered.map(r => (
            <div key={r.userName} className="px-5 py-3 flex items-center gap-3">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                r.readAt
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400',
              )}>
                {r.readAt ? <CheckCircle2 size={14} /> : <Clock size={13} />}
              </div>
              <p className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
                {r.userName}
              </p>
              <p className="text-[11px] text-slate-400 shrink-0">
                {r.readAt ? r.readAtLabel : 'não lido'}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StatCard({
  label, value, suffix, color,
}: { label: string; value: number; suffix?: string; color: string }) {
  return (
    <div className={cn('rounded-xl px-4 py-3', color)}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">
        {value} {suffix && <span className="text-sm font-normal opacity-70">{suffix}</span>}
      </p>
    </div>
  )
}
