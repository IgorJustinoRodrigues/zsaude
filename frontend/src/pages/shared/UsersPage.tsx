import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Wifi, WifiOff, Clock, MapPin } from 'lucide-react'
import { sessionsApi, type PresenceItem } from '../../api/sessions'
import { userApi, type UserListItem } from '../../api/users'
import { directoryApi, type MunicipalityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { initials, normalize, cn } from '../../lib/utils'
import { ComboBox, type ComboBoxOption } from '../../components/ui/ComboBox'

function formatRelativeTime(iso: string): string {
  const diffMins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMins < 1)  return 'agora mesmo'
  if (diffMins < 60) return `há ${diffMins}min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `há ${diffHours}h`
  return `há ${Math.floor(diffHours / 24)}d`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface Row {
  id: string
  name: string
  email: string
  role: string
  online: boolean
  since?: string        // hh:mm
  lastSeenIso?: string  // para formatRelative
  ip?: string
}

export function UsersPage() {
  const [search, setSearch] = useState('')
  const [tab, setTab]       = useState<'all' | 'online' | 'offline'>('all')
  const [presence, setPresence] = useState<PresenceItem[]>([])
  const [users,    setUsers]    = useState<UserListItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [municipalities, setMunicipalities] = useState<MunicipalityDto[]>([])
  const [munFilter, setMunFilter] = useState<string | null>(null)

  // Carrega municípios disponíveis pro ator (MASTER vê tudo, ADMIN só os seus).
  useEffect(() => {
    directoryApi.listMunicipalities('actor')
      .then(setMunicipalities)
      .catch(() => setMunicipalities([]))
  }, [])

  const municipalityOptions = useMemo<ComboBoxOption[]>(
    () => municipalities.map(m => ({ value: m.id, label: m.name, hint: m.state })),
    [municipalities],
  )

  const load = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([
        sessionsApi.presence('actor', munFilter),
        userApi.list({ pageSize: 100, municipalityId: munFilter ?? undefined }),
      ])
      setPresence(p)
      setUsers(u.items)
    } catch (e) {
      // permissão negada pra listar usuários se não for admin? lista presença só
      if (e instanceof HttpError && e.status === 403) {
        try {
          const p = await sessionsApi.presence('actor', munFilter)
          setPresence(p)
        } catch {
          toast.error('Falha ao carregar presença')
        }
      } else {
        toast.error('Falha ao carregar usuários', e instanceof HttpError ? e.message : '')
      }
    } finally {
      setLoading(false)
    }
  }, [munFilter])

  useEffect(() => { void load() }, [load])

  // Auto-refresh a cada 15s para manter os estados online/offline atualizados
  useEffect(() => {
    const id = setInterval(() => { void load() }, 15_000)
    return () => clearInterval(id)
  }, [load])

  const presenceByUser = new Map(presence.map(p => [p.userId, p]))

  const rows: Row[] = users.length > 0
    ? users.map(u => {
        const p = presenceByUser.get(u.id)
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.primaryRole,
          online: !!p,
          since: p ? formatTime(p.startedAt) : undefined,
          lastSeenIso: p?.lastSeenAt,
          ip: p?.ip,
        }
      })
    : presence.map(p => ({
        id: p.userId,
        name: p.userName,
        email: p.email,
        role: p.primaryRole,
        online: true,
        since: formatTime(p.startedAt),
        lastSeenIso: p.lastSeenAt,
        ip: p.ip,
      }))

  const online  = rows.filter(r => r.online)
  const offline = rows.filter(r => !r.online)

  const filtered = rows.filter(r => {
    const matchTab = tab === 'online' ? r.online : tab === 'offline' ? !r.online : true
    const q = normalize(search)
    return matchTab && (!q ||
      normalize(r.name).includes(q) ||
      normalize(r.role).includes(q) ||
      normalize(r.email).includes(q)
    )
  })

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Usuários do sistema</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Sessões ativas (últimos 2 min) · atualiza automaticamente a cada 15s
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <SummaryCard
          icon={<Wifi size={14} className="text-emerald-500" />}
          bg="bg-emerald-50 dark:bg-emerald-950/40"
          label="Online agora"
          value={online.length}
        />
        <SummaryCard
          icon={<WifiOff size={14} className="text-slate-400" />}
          bg="bg-slate-100 dark:bg-slate-800"
          label="Offline"
          value={offline.length}
        />
        <SummaryCard
          icon={<span className="text-xs font-bold text-sky-500">T</span>}
          bg="bg-sky-50 dark:bg-sky-950/40"
          label="Total"
          value={rows.length}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, cargo, e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400"
          />
        </div>
        {municipalities.length > 1 && (
          <div className="sm:w-64 flex items-center gap-2">
            <MapPin size={13} className="text-slate-400 shrink-0" />
            <ComboBox
              value={munFilter}
              onChange={setMunFilter}
              placeholder="Todos os municípios"
              options={municipalityOptions}
              className="flex-1"
            />
          </div>
        )}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          {([['all', 'Todos'], ['online', 'Online'], ['offline', 'Offline']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                tab === key
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              )}
            >
              {label}
              {key === 'online' && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-emerald-500 text-white rounded-full">{online.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <Search size={28} className="mb-2 opacity-30" />
          <p className="text-sm">Nenhum usuário encontrado</p>
        </div>
      ) : (
        <>
          {/* Mobile/tablet: cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
            {filtered.map(r => <UserCard key={r.id} row={r} />)}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[auto_1.2fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="w-8" />
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Usuário</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Perfil</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(r => <UserRow key={r.id} row={r} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3">
      <div className={cn('w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center shrink-0', bg)}>{icon}</div>
      <div>
        <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-none">{value}</p>
        <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function UserCard({ row }: { row: Row }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-start gap-3">
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white bg-sky-500">
          {initials(row.name)}
        </div>
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900',
          row.online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{row.name}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{row.role}</p>
        <p className="text-[11px] text-slate-400 truncate">{row.email}</p>
        <div className="mt-2">
          {row.online ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Online</span>
              {row.since && <span className="text-[10px] text-slate-400">desde {row.since}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock size={11} />
              <span className="text-xs">{row.lastSeenIso ? formatRelativeTime(row.lastSeenIso) : 'nunca logou'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UserRow({ row }: { row: Row }) {
  return (
    <div className="grid grid-cols-[auto_1.2fr_1fr_auto] gap-4 items-center px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <div className="relative w-8 h-8 shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-sky-500">
          {initials(row.name)}
        </div>
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900',
          row.online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
        )} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{row.name}</p>
        <p className="text-xs text-slate-500 truncate">{row.email}</p>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{row.role}</p>
      {row.online ? (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Online</span>
          {row.since && <span className="text-[10px] text-slate-400">desde {row.since}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Clock size={12} className="text-slate-400" />
          <span className="text-xs text-slate-500">{row.lastSeenIso ? formatRelativeTime(row.lastSeenIso) : 'nunca logou'}</span>
        </div>
      )}
    </div>
  )
}
