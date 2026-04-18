import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cake, ChevronLeft, ChevronRight } from 'lucide-react'
import { userApi, type UserBirthdayItem } from '../../api/users'
import { HttpError } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { initials, cn } from '../../lib/utils'

interface Props {
  /**
   * Base path pra navegação ao clicar num aniversariante —
   * ``/sys/usuarios`` no MASTER shell, ``/ops/usuarios`` no OPS shell.
   * Quando o alvo é o próprio usuário, sempre vai pra "Minha conta"
   * (``/sys/minha-conta`` ou ``/minha-conta``).
   */
  viewBasePath: '/sys/usuarios' | '/ops/usuarios'
  /** Cor do accent (tab ativa, bordas, labels). Default violet. */
  accent?: 'violet' | 'sky' | 'slate'
  /**
   * Opcional — restringe aos aniversariantes vinculados a este município.
   * Usado em ``/ops`` pra listar só quem tem acesso à cidade ativa.
   * MASTER em ``/sys`` costuma omitir (vê todos).
   */
  municipalityId?: string
}

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

const LEVEL_STYLE: Record<string, string> = {
  master: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  admin:  'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:bg-sky-950/40 dark:text-sky-400',
  user:   'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const ACCENT_TEXT: Record<NonNullable<Props['accent']>, string> = {
  violet: 'text-violet-600 dark:text-violet-400',
  sky:    'text-sky-600 dark:text-sky-400',
  slate:  'text-slate-700 dark:text-slate-200',
}

export function BirthdaysPanel({
  viewBasePath, accent = 'violet', municipalityId,
}: Props) {
  const navigate = useNavigate()
  const currentUserId = useAuthStore(s => s.user?.id)
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [items, setItems] = useState<UserBirthdayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await userApi.birthdays(month, municipalityId)
      setItems(r)
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao carregar.'
      setError(msg)
    } finally { setLoading(false) }
  }, [month, municipalityId])

  useEffect(() => { void load() }, [load])

  const isCurrentMonth = month === today.getMonth() + 1
  const todayItems = items.filter(u => u.isToday)

  // Base pra "minha conta" depende do shell atual
  const myAccountPath = viewBasePath.startsWith('/sys') ? '/sys/minha-conta' : '/minha-conta'

  function handleClick(user: UserBirthdayItem) {
    if (user.id === currentUserId) navigate(myAccountPath)
    else navigate(`${viewBasePath}/${user.id}`)
  }

  return (
    <div className="space-y-4">
      {/* Navegador de mês */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setMonth(m => m === 1 ? 12 : m - 1)}
            className="px-3 py-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-4 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-[140px] text-center">
            {MONTH_NAMES[month - 1]}
          </span>
          <button
            onClick={() => setMonth(m => m === 12 ? 1 : m + 1)}
            className="px-3 py-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {!isCurrentMonth && (
          <button
            onClick={() => setMonth(today.getMonth() + 1)}
            className={cn('text-xs font-medium hover:underline', ACCENT_TEXT[accent])}
          >
            Voltar pro mês atual
          </button>
        )}
      </div>

      {/* Destaque "hoje" */}
      {todayItems.length > 0 && (
        <div className="bg-gradient-to-br from-pink-50 via-amber-50 to-violet-50 dark:from-pink-950/40 dark:via-amber-950/40 dark:to-violet-950/40 border border-pink-200 dark:border-pink-900 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cake size={16} className="text-pink-500" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Hoje · {todayItems.length} aniversariante{todayItems.length > 1 ? 's' : ''}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {todayItems.map(u => (
              <BirthdayCard
                key={u.id}
                user={u}
                highlight
                currentUserId={currentUserId}
                onClick={() => handleClick(u)}
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
          <Cake size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum aniversariante em {MONTH_NAMES[month - 1]}.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {items.map(u => (
            <BirthdayRow
              key={u.id}
              user={u}
              currentUserId={currentUserId}
              onClick={() => handleClick(u)}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        Apenas usuários ativos com data de nascimento cadastrada aparecem aqui.
      </p>
    </div>
  )
}

// ─── Building blocks ──────────────────────────────────────────────────────────

function BirthdayRow({
  user, onClick, currentUserId,
}: { user: UserBirthdayItem; onClick: () => void; currentUserId: string | undefined }) {
  const displayName = user.socialName || user.name
  const isSelf = user.id === currentUserId
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left">
      <div className={cn(
        'w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0',
        user.isToday
          ? 'bg-gradient-to-br from-pink-400 to-amber-400 text-white'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
      )}>
        <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">
          {MONTH_NAMES[user.month - 1].slice(0, 3)}
        </span>
        <span className="text-base font-bold leading-none">{user.day}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
          {displayName}
          {isSelf && <span className="ml-2 text-[10px] font-medium text-slate-400">(você)</span>}
        </p>
        <p className="text-[11px] text-slate-400 truncate">
          {user.primaryRole || '—'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full', LEVEL_STYLE[user.level])}>
          {user.level}
        </span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {user.age} anos
        </span>
        {user.isToday && <Cake size={14} className="text-pink-500" />}
      </div>
    </button>
  )
}

function BirthdayCard({
  user, highlight, onClick, currentUserId,
}: { user: UserBirthdayItem; highlight?: boolean; onClick: () => void; currentUserId: string | undefined }) {
  const displayName = user.socialName || user.name
  const isSelf = user.id === currentUserId
  return (
    <button onClick={onClick} className={cn(
      'flex items-center gap-3 p-3 rounded-xl text-left transition-colors',
      highlight
        ? 'bg-white/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900'
        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
    )}>
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-amber-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
        {initials(displayName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
          {displayName}
          {isSelf && <span className="ml-2 text-[10px] font-medium text-slate-400">(você)</span>}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {user.age} anos · {user.primaryRole || '—'}
        </p>
      </div>
    </button>
  )
}
