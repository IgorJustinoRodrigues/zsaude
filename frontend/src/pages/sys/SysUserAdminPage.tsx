import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, UserPlus, Users, Shield, UserCheck, UserX,
  Cake,
} from 'lucide-react'
import { userApi, type UserListItem } from '../../api/users'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
import { initials, cn } from '../../lib/utils'
import { BirthdaysPanel } from '../../components/shared/BirthdaysPanel'
import { ExportMenuButton } from '../../components/ui/ExportMenuButton'
import type { ExportBranding, ExportOptions } from '../../lib/export'
import { useBranding } from '../../hooks/useBranding'

type LevelFilter = 'master' | 'admin' | 'all'
type Tab = 'users' | 'birthdays'

const STATUS_STYLE: Record<string, string> = {
  Ativo:    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  Inativo:  'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  Bloqueado:'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
}

const LEVEL_STYLE: Record<string, string> = {
  master: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  admin:  'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  user:   'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

export function SysUserAdminPage() {
  const navigate = useNavigate()
  const currentUserId = useAuthStore(s => s.user?.id)
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield size={20} className="text-violet-500" />
            Administradores da plataforma
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Usuários MASTER e ADMIN. Para gerenciar usuários operacionais, use a área do município.
          </p>
        </div>
        {tab === 'users' && (
          <button
            onClick={() => navigate('/sys/usuarios/novo')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shrink-0"
          >
            <UserPlus size={15} />
            Novo usuário
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-1">
        <TabBtn active={tab === 'users'} onClick={() => setTab('users')} icon={<Users size={14} />}>
          Usuários
        </TabBtn>
        <TabBtn active={tab === 'birthdays'} onClick={() => setTab('birthdays')} icon={<Cake size={14} />}>
          Aniversariantes
        </TabBtn>
      </div>

      {tab === 'users'
        ? <UsersTab navigate={navigate} currentUserId={currentUserId} />
        : <BirthdaysPanel viewBasePath="/sys/usuarios" accent="violet" />}
    </div>
  )
}

// ─── Tab "Usuários" (listagem original) ───────────────────────────────────────

function UsersTab({
  navigate, currentUserId,
}: {
  navigate: ReturnType<typeof useNavigate>
  currentUserId: string | undefined
}) {
  const [items, setItems] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState<LevelFilter>('all')
  const branding = useBranding()

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await userApi.list({ search: search || undefined, pageSize: 100 })
      setItems(r.items)
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao carregar.'
      setError(msg)
      toast.error('Falha ao carregar', msg)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { void load() }, [load])

  const filtered = items.filter(u =>
    (level === 'all' || u.level === level) &&
    !(level === 'all' && u.level === 'user')
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail, CPF..."
            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200" />
        </div>
        <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
          {(['all','master','admin'] as LevelFilter[]).map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                level === l ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}>
              {l === 'all' ? 'MASTER + ADMIN' : l.toUpperCase()}
            </button>
          ))}
        </div>
        <ExportMenuButton<UserListItem>
          options={buildExportOptions(filtered, level, branding)}
          pdfOrientation="landscape"
        />
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users size={32} />} label="Nenhum administrador encontrado." />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(u => (
            <button key={u.id} onClick={() => {
              if (u.id === currentUserId) navigate('/sys/minha-conta')
              else navigate(`/sys/usuarios/${u.id}`)
            }}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left">
              <div className="w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center text-[12px] font-bold text-white shrink-0">
                {initials(u.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{u.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{u.email} · {u.primaryRole}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full', LEVEL_STYLE[u.level])}>
                  {u.level}
                </span>
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_STYLE[u.status] ?? '')}>
                  {u.status === 'Ativo' ? <UserCheck size={11} className="inline mr-1" /> : u.status === 'Bloqueado' ? <UserX size={11} className="inline mr-1" /> : null}
                  {u.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Export padrão do sistema ─────────────────────────────────────────────────

function buildExportOptions(
  items: UserListItem[],
  level: LevelFilter,
  branding?: ExportBranding,
): ExportOptions<UserListItem> {
  const levelLabel = level === 'all' ? 'MASTER + ADMIN' : level.toUpperCase()
  return {
    title: 'Administradores da plataforma',
    subtitle: `${levelLabel} · ${items.length} ${items.length === 1 ? 'usuário' : 'usuários'}`,
    filename: `administradores-${level}`,
    rows: items,
    columns: [
      { header: 'Nome',    get: u => u.name },
      { header: 'E-mail',  get: u => u.email ?? '—' },
      { header: 'CPF',     get: u => u.cpf ?? '—', width: 110 },
      { header: 'Telefone', get: u => u.phone || '—', width: 110 },
      { header: 'Perfil',  get: u => u.primaryRole || '—' },
      { header: 'Nível',   get: u => u.level.toUpperCase(), align: 'center', width: 70 },
      { header: 'Status',  get: u => u.status, align: 'center', width: 70 },
    ],
    branding,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TabBtn({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-violet-500 text-violet-700 dark:text-violet-400'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    </div>
  )
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
      <div className="mx-auto mb-2 opacity-40 inline-block">{icon}</div>
      <p className="text-sm">{label}</p>
    </div>
  )
}
