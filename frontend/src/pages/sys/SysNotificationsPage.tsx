import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Megaphone, Users, MapPin, Building2, User as UserIcon,
  Plus, X,
} from 'lucide-react'
import {
  notificationsAdminApi,
  type BroadcastCreateInput,
  type BroadcastRead,
  type BroadcastScope,
  type NotificationType,
} from '../../api/notifications'
import { directoryApi, type MunicipalityDto, type FacilityDto } from '../../api/workContext'
import { userApi, type UserListItem } from '../../api/users'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ComboBox, type ComboBoxOption } from '../../components/ui/ComboBox'

const TYPES: { value: NotificationType; label: string; color: string }[] = [
  { value: 'info',    label: 'Informativo', color: '#0ea5e9' },
  { value: 'success', label: 'Sucesso',     color: '#10b981' },
  { value: 'warning', label: 'Aviso',       color: '#f59e0b' },
  { value: 'error',   label: 'Erro',        color: '#ef4444' },
]

export function SysNotificationsPage() {
  const navigate = useNavigate()
  const [broadcasts, setBroadcasts] = useState<BroadcastRead[]>([])
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await notificationsAdminApi.listBroadcasts()
      setBroadcasts(list)
    } catch (e) {
      toast.error('Falha ao carregar histórico', e instanceof HttpError ? e.message : '')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Megaphone size={20} className="text-violet-500" />
            Central de notificações
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dispare avisos manualmente pra todos, um município, uma unidade ou um usuário específico.
            Acompanhe quem leu.
          </p>
        </div>
        <button
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shrink-0"
        >
          <Plus size={15} />
          Nova notificação
        </button>
      </header>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-400">
          Carregando…
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
            <Megaphone size={22} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Nenhuma notificação enviada ainda.</p>
          <p className="text-xs text-slate-500 mt-1">Clique em "Nova notificação" pra começar.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {broadcasts.map(b => (
            <BroadcastRow key={b.id} b={b} onClick={() => navigate(`/sys/notificacoes/${b.id}`)} />
          ))}
        </div>
      )}

      {composing && (
        <ComposerModal
          onClose={() => setComposing(false)}
          onSent={async () => { setComposing(false); await load() }}
        />
      )}
    </div>
  )
}

// ─── Row do histórico ──────────────────────────────────────────────────────

function BroadcastRow({ b, onClick }: { b: BroadcastRead; onClick: () => void }) {
  const pct = b.totalRecipients > 0
    ? Math.round((b.readCount / b.totalRecipients) * 100)
    : 0
  const typeMeta = TYPES.find(t => t.value === b.type) ?? TYPES[0]
  const scopeIcon = b.scopeType === 'all' ? Users
    : b.scopeType === 'municipality' ? MapPin
    : b.scopeType === 'facility' ? Building2
    : UserIcon
  const ScopeIcon = scopeIcon
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: typeMeta.color + '18', color: typeMeta.color }}
        >
          <Megaphone size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                {b.title}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
                <ScopeIcon size={11} />
                {b.scopeLabel}
                <span className="mx-1">·</span>
                {new Date(b.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {b.createdByName && (
                  <>
                    <span className="mx-1">·</span>
                    por {b.createdByName}
                  </>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {b.readCount} / {b.totalRecipients} <span className="text-slate-400 font-normal">lidas</span>
              </p>
              <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">
            {b.message}
          </p>
        </div>
      </div>
    </button>
  )
}

// ─── Composer ──────────────────────────────────────────────────────────────

function ComposerModal({ onClose, onSent }: { onClose: () => void; onSent: () => Promise<void> | void }) {
  const [scopeType, setScopeType] = useState<BroadcastScope>('all')
  const [scopeId, setScopeId]     = useState<string | null>(null)
  const [type, setType]           = useState<NotificationType>('info')
  const [category, setCategory]   = useState('manual')
  const [title, setTitle]         = useState('')
  const [message, setMessage]     = useState('')
  const [body, setBody]           = useState('')
  const [actionUrl, setActionUrl]     = useState('')
  const [actionLabel, setActionLabel] = useState('')
  const [sending, setSending]     = useState(false)

  const [municipalities, setMunicipalities] = useState<MunicipalityDto[]>([])
  const [facilities, setFacilities] = useState<FacilityDto[]>([])
  const [users, setUsers] = useState<UserListItem[]>([])

  useEffect(() => {
    directoryApi.listMunicipalities('actor').then(setMunicipalities).catch(() => {})
    directoryApi.listFacilities(undefined, 'actor').then(setFacilities).catch(() => {})
    userApi.list({ pageSize: 100 }).then(r => setUsers(r.items)).catch(() => {})
  }, [])

  // Pra unidade, filtra por município primeiro (padrão do SysEmailCredentialsPage).
  const [facFilterMunId, setFacFilterMunId] = useState<string | null>(null)
  const munOptions = useMemo<ComboBoxOption[]>(
    () => municipalities.map(m => ({ value: m.id, label: m.name, hint: m.state })),
    [municipalities],
  )
  const facOptions = useMemo<ComboBoxOption[]>(
    () => facilities
      .filter(f => !facFilterMunId || f.municipalityId === facFilterMunId)
      .map(f => ({ value: f.id, label: f.shortName })),
    [facilities, facFilterMunId],
  )
  const userOptions = useMemo<ComboBoxOption[]>(
    () => users.map(u => ({ value: u.id, label: u.name, hint: u.email ?? u.cpf ?? '' })),
    [users],
  )

  const send = async () => {
    if (!title.trim() || !message.trim()) {
      toast.warning('Preencha título e mensagem')
      return
    }
    if (scopeType !== 'all' && !scopeId) {
      toast.warning('Selecione o destino')
      return
    }
    if (!!actionUrl.trim() && !actionLabel.trim()) {
      toast.warning('Defina o texto do botão de ação')
      return
    }
    setSending(true)
    try {
      const payload: BroadcastCreateInput = {
        scopeType,
        scopeId: scopeType === 'all' ? null : scopeId,
        type,
        category: category.trim() || 'manual',
        title: title.trim(),
        message: message.trim(),
        body: body.trim() || null,
        actionUrl: actionUrl.trim() || null,
        actionLabel: actionLabel.trim() || null,
      }
      const r = await notificationsAdminApi.createBroadcast(payload)
      toast.success('Notificação enviada', `${r.totalRecipients} destinatários`)
      await onSent()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao enviar.'
      toast.error('Falha ao enviar', msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Send size={18} className="text-violet-500" />
            Nova notificação
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Escopo */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Destinatários *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {([
                { v: 'all',          label: 'Todos',      icon: Users },
                { v: 'municipality', label: 'Município',  icon: MapPin },
                { v: 'facility',     label: 'Unidade',    icon: Building2 },
                { v: 'user',         label: 'Usuário',    icon: UserIcon },
              ] as const).map(s => {
                const Icon = s.icon
                return (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => { setScopeType(s.v); setScopeId(null) }}
                    className={cn(
                      'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      scopeType === s.v
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200',
                    )}
                  >
                    <Icon size={12} />
                    {s.label}
                  </button>
                )
              })}
            </div>

            {scopeType === 'all' && (
              <p className="text-[11px] text-slate-400 mt-2">
                Envio a todos os usuários ativos do sistema (só MASTER pode).
              </p>
            )}
            {scopeType === 'municipality' && (
              <div className="mt-2">
                <ComboBox
                  value={scopeId}
                  onChange={setScopeId}
                  placeholder="Selecione o município…"
                  options={munOptions}
                />
              </div>
            )}
            {scopeType === 'facility' && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ComboBox
                  value={facFilterMunId}
                  onChange={val => { setFacFilterMunId(val); setScopeId(null) }}
                  placeholder="Município"
                  options={munOptions}
                />
                <ComboBox
                  value={scopeId}
                  onChange={setScopeId}
                  placeholder={facFilterMunId ? 'Unidade' : 'Escolha o município primeiro'}
                  options={facOptions}
                  disabled={!facFilterMunId}
                />
              </div>
            )}
            {scopeType === 'user' && (
              <div className="mt-2">
                <ComboBox
                  value={scopeId}
                  onChange={setScopeId}
                  placeholder="Selecione o usuário…"
                  options={userOptions}
                />
              </div>
            )}
          </div>

          {/* Tipo + categoria */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severidade">
              <div className="flex gap-1">
                {TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
                      type === t.value
                        ? 'text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300',
                    )}
                    style={type === t.value
                      ? { backgroundColor: t.color, borderColor: t.color }
                      : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Categoria" hint="Livre, ex: anuncio, manutencao, politica">
              <input value={category} onChange={e => setCategory(e.target.value)}
                className={inputCls} placeholder="manual" />
            </Field>
          </div>

          {/* Título + mensagem */}
          <Field label="Título *">
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Manutenção programada neste sábado"
              className={inputCls} maxLength={200} />
          </Field>
          <Field label="Mensagem curta *" hint="Aparece no card/sino.">
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              rows={2} className={cn(inputCls, 'resize-none')} maxLength={500} />
          </Field>
          <Field label="Conteúdo extenso (opcional)" hint="Exibido no modal de detalhe quando o usuário clicar.">
            <textarea value={body} onChange={e => setBody(e.target.value)}
              rows={5} className={cn(inputCls, 'resize-none')} />
          </Field>

          {/* Ação */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="URL de ação (opcional)" hint="Rota interna (/minha-conta) ou URL externa (https://…)">
              <input value={actionUrl} onChange={e => setActionUrl(e.target.value)}
                placeholder="/minha-conta" className={inputCls} />
            </Field>
            <Field label="Texto do botão" hint="Obrigatório se tiver URL">
              <input value={actionLabel} onChange={e => setActionLabel(e.target.value)}
                placeholder="Conferir minha conta" className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={sending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            Cancelar
          </button>
          <button type="button" onClick={send} disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60">
            <Send size={14} />
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200'
