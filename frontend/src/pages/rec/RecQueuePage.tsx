// Console da recepcionista. Lista senhas ativas da unidade, permite
// chamar/atender/encaminhar/cancelar + confirmar presença em handover
// cross-unidade.
//
// Por enquanto usa polling (5s). WS real-time pode vir depois — humano
// opera em minutos, então 5s é suficiente.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, Info, PhoneCall, Plus, Settings2,
  ShieldAlert, Star, UserCheck, VolumeX, X,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { HttpError } from '../../api/client'
import { recApi, type AttendanceItem, type OrderReason } from '../../api/rec'
import { recConfigApi } from '../../api/recConfig'
import { sectorsApi, type Sector } from '../../api/sectors'
import { useAuthStore } from '../../store/authStore'
import { PatientPhotoImg } from '../hsp/components/PatientPhotoImg'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const POLL_MS = 5_000
/** Após chamar/pedir silêncio, mantém o botão desativado por esse tempo
 *  pra evitar duplo-clique sem querer. */
const ACTION_COOLDOWN_MS = 5_000

interface CounterConfig {
  number: string
  priority: boolean
}

const COUNTER_STORAGE_KEY = 'rec.counter-config'

function loadCounter(): CounterConfig | null {
  try {
    const raw = localStorage.getItem(COUNTER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.number !== 'string') return null
    return { number: parsed.number, priority: !!parsed.priority }
  } catch { return null }
}

function saveCounter(cfg: CounterConfig) {
  try { localStorage.setItem(COUNTER_STORAGE_KEY, JSON.stringify(cfg)) }
  catch { /* storage cheio/bloqueado — ignora */ }
}

function counterLabel(cfg: CounterConfig | null): string {
  return cfg?.number ?? '—'
}

export function RecQueuePage() {
  const navigate = useNavigate()
  const [counter, setCounter] = useState<CounterConfig | null>(() => loadCounter())
  const [counterModal, setCounterModal] = useState(false)
  const [tickets, setTickets] = useState<AttendanceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sectors, setSectors] = useState<Sector[]>([])
  // Setor sugerido pelo admin (config do município/unidade) — usado
  // pra pré-selecionar no ForwardModal.
  const [suggestedSector, setSuggestedSector] = useState<string | null>(null)
  // Lista de setores permitidos pelo admin no encaminhamento.
  // ``null`` = todos. Carregado da rec_config efetiva.
  const [allowedSectorNames, setAllowedSectorNames] = useState<string[] | null>(null)
  const [silenceButtonEnabled, setSilenceButtonEnabled] = useState(true)
  // Cooldowns pra evitar duplo-clique. Mapa ticket_id → timestamp "libera em".
  const [callCooldowns, setCallCooldowns] = useState<Record<string, number>>({})
  const [silenceCooldownUntil, setSilenceCooldownUntil] = useState(0)
  // Re-render a cada 1s pra atualizar os countdowns visualmente.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const now = Date.now()
  const silenceDisabledSec = Math.max(0, Math.ceil((silenceCooldownUntil - now) / 1000))
  const [attendModal, setAttendModal] = useState<AttendanceItem | null>(null)
  const [forwardModal, setForwardModal] = useState<AttendanceItem | null>(null)
  const counterName = counterLabel(counter)

  const reload = useCallback(async () => {
    try {
      const list = await recApi.listTickets()
      setTickets(list)
    } catch (err) {
      if (err instanceof HttpError) toast.error('Fila', err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const facilityId = useAuthStore(s => s.context?.facility.id)

  useEffect(() => {
    void reload()
    void sectorsApi.effective().then(r => setSectors(r.sectors)).catch(() => {})
    // Config efetiva — passa o facilityId explicitamente (o endpoint
    // aceita esse fallback sem precisar decodificar X-Work-Context).
    if (facilityId) {
      void recConfigApi.effective({ facilityId })
        .then(cfg => {
          setSuggestedSector(cfg.recepcao.afterAttendanceSector)
          setAllowedSectorNames(cfg.recepcao.forwardSectorNames)
          setSilenceButtonEnabled(cfg.painel.silenceEnabled)
        })
        .catch(() => { /* sem sugestão — modal abre no default */ })
    }
    const id = window.setInterval(reload, POLL_MS)
    return () => window.clearInterval(id)
  }, [reload, facilityId])

  // Em atendimento fica no topo; aguardando no meio; encaminhados no fim.
  // O backend já retorna ordenado por (priority DESC, arrived_at ASC),
  // então prioritários aparecem primeiro naturalmente — tanto em guichês
  // normais quanto prioritários. A diferença do "guichê prioritário" é
  // apenas visual (badge), pra a atendente ter em mente que deve chamar
  // os prioritários primeiro.
  const { inService, waiting, rest } = useMemo(() => {
    const s: AttendanceItem[] = []
    const w: AttendanceItem[] = []
    const r: AttendanceItem[] = []
    for (const t of tickets) {
      if (t.status === 'reception_attending') s.push(t)
      else if (t.status === 'reception_waiting' || t.status === 'reception_called') w.push(t)
      else r.push(t)
    }
    return { inService: s, waiting: w, rest: r }
  }, [tickets])

  async function doCall(t: AttendanceItem) {
    // Marca em cooldown imediatamente — evita clique duplo durante a request.
    setCallCooldowns(m => ({ ...m, [t.id]: Date.now() + ACTION_COOLDOWN_MS }))
    try {
      await recApi.callTicket(t.id)
      // Publica no painel — guichê só vai junto quando a atendente
      // configurou. Unidades com 1 ponto de atendimento pulam essa info.
      await recApi.publishCall({
        ticket: t.ticketNumber,
        counter: counter ? counterName : null,
        patientName: t.patientName,
        priority: t.priority,
      }).catch(() => {})
      const who = t.patientName ? ` · ${t.patientName}` : ''
      const where = counter ? ` · ${counterName}` : ''
      toast.success('Chamado', `${t.ticketNumber}${who}${where}`)
      void reload()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Chamar', err.message)
    }
  }

  // Re-anúncio do paciente que JÁ está em atendimento: não muda o status
  // no backend — só republica o evento pro painel/TTS falar de novo.
  // Útil quando o paciente não escutou/não apareceu.
  async function doRecallInService(t: AttendanceItem) {
    setCallCooldowns(m => ({ ...m, [t.id]: Date.now() + ACTION_COOLDOWN_MS }))
    try {
      await recApi.publishCall({
        ticket: t.ticketNumber,
        counter: counter ? counterName : null,
        patientName: t.patientName,
        priority: t.priority,
      })
      const who = t.patientName ? ` · ${t.patientName}` : ''
      const where = counter ? ` · ${counterName}` : ''
      toast.success('Rechamado', `${t.ticketNumber}${who}${where}`)
    } catch (err) {
      if (err instanceof HttpError) toast.error('Rechamar', err.message)
    }
  }

  async function doStart(t: AttendanceItem) {
    try {
      await recApi.startTicket(t.id)
      void reload()
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.code === 'handover_required') {
          toast.error('Handover pendente', err.message)
        } else toast.error('Atender', err.message)
      }
    }
  }

  async function doForward(t: AttendanceItem, sectorName: string) {
    try {
      await recApi.forwardTicket(t.id, sectorName)
      toast.success('Encaminhado', `${t.ticketNumber} → ${sectorName}`)
      void reload()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Encaminhar', err.message)
    }
  }

  async function doAssumeHandover(t: AttendanceItem) {
    try {
      await recApi.assumeHandover(t.id)
      toast.success('Presença confirmada', `${t.ticketNumber} liberado`)
      void reload()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Handover', err.message)
    }
  }

  return (
    <div>
      <PageHeader title="Recepção" subtitle="Senhas ativas da unidade" />

      {/* Barra de ações — configuração do guichê (opcional) */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => setCounterModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-border bg-card hover:bg-muted text-foreground transition-colors"
          title={counter
            ? 'Guichê configurado — clique pra editar'
            : 'Opcional: útil em unidades com mais de um guichê'}
        >
          <Settings2 size={14} />
          <span>{counter ? counterName : 'Configurar guichê'}</span>
          {counter?.priority && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-[10px] font-bold uppercase tracking-wider">
              <Star size={9} /> Prioritário
            </span>
          )}
        </button>
        <div className="flex-1" />
        {silenceButtonEnabled && (
          <button
            disabled={silenceDisabledSec > 0}
            onClick={async () => {
              setSilenceCooldownUntil(Date.now() + ACTION_COOLDOWN_MS)
              try {
                await recApi.requestSilence()
                toast.info('Silêncio solicitado', 'Exibido no painel por alguns segundos.')
              } catch (err) {
                if (err instanceof HttpError) toast.error('Silêncio', err.message)
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-card hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"
            title="Mostra no painel um aviso grande de 'Silêncio, por favor'"
          >
            <VolumeX size={14} />
            {silenceDisabledSec > 0 ? `Aguarde ${silenceDisabledSec}s` : 'Solicitar silêncio'}
          </button>
        )}
        <button
          onClick={() => navigate('/rec/atendimento/novo')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors shadow-sm shadow-teal-500/20"
        >
          <Plus size={14} /> Novo atendimento
        </button>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Carregando fila…</div>
      ) : (
        <section>
          {inService.length > 0 && (
            <>
              <QueueSection
                title="Em atendimento"
                items={inService}
                emptyMsg=""
                variant="inService"
                callCooldowns={callCooldowns}
                onCall={doRecallInService}
                onForward={t => setForwardModal(t)}
                onOpenAttend={t => {
                  // Em "Em atendimento", abrir = ir pro wizard de atendimento
                  // (identidade → dados → encaminhamento). Ticket manual
                  // sem patientId cai no AttendModal.
                  if (t.patientId) navigate(`/rec/atendimento/${t.patientId}`)
                  else setAttendModal(t)
                }}
              />
              <div className="mt-8" />
            </>
          )}

          <QueueSection
            title="Aguardando"
            items={waiting}
            emptyMsg="Ninguém aguardando no momento."
            callCooldowns={callCooldowns}
            onCall={doCall}
            onStart={doStart}
            onAssumeHandover={doAssumeHandover}
            onOpenAttend={t => setAttendModal(t)}
          />

          {rest.length > 0 && (
            <>
              <div className="mt-8" />
              <QueueSection
                title="Encaminhados"
                items={rest}
                emptyMsg=""
                variant="rest"
              />
            </>
          )}
        </section>
      )}

      {attendModal && (
        <AttendModal
          ticket={attendModal}
          counter={counter ? counterName : ''}
          onClose={() => setAttendModal(null)}
          onCall={async t => { await doCall(t); setAttendModal(null) }}
          onStart={async t => { await doStart(t); setAttendModal(null) }}
          onAssumeHandover={async t => { await doAssumeHandover(t) }}
          onForward={async t => { setAttendModal(null); setForwardModal(t) }}
        />
      )}
      {counterModal && (
        <CounterConfigModal
          initial={counter}
          onClose={() => setCounterModal(false)}
          onSave={cfg => {
            setCounter(cfg)
            saveCounter(cfg)
            setCounterModal(false)
          }}
          onClear={() => {
            setCounter(null)
            try { localStorage.removeItem(COUNTER_STORAGE_KEY) } catch {}
            setCounterModal(false)
          }}
        />
      )}
      {forwardModal && (
        <ForwardModal
          ticket={forwardModal}
          sectors={sectors}
          allowedSectorNames={allowedSectorNames}
          suggestedSector={suggestedSector}
          onClose={() => setForwardModal(null)}
          onConfirm={async sector => {
            await doForward(forwardModal, sector)
            setForwardModal(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Sessão da fila ─────────────────────────────────────────────────────────

type QueueSectionProps = {
  title: string
  items: AttendanceItem[]
  emptyMsg: string
  variant?: 'waiting' | 'inService' | 'rest'
  headerBadge?: React.ReactNode
  /** Mapa ticket_id → timestamp de quando o botão Chamar libera. */
  callCooldowns?: Record<string, number>
  onCall?: (t: AttendanceItem) => void
  onStart?: (t: AttendanceItem) => void
  onForward?: (t: AttendanceItem) => void
  onAssumeHandover?: (t: AttendanceItem) => void
  onOpenAttend?: (t: AttendanceItem) => void
}

function QueueSection({
  title, items, emptyMsg, variant = 'waiting', headerBadge, callCooldowns,
  onCall, onStart, onForward, onAssumeHandover, onOpenAttend,
}: QueueSectionProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {headerBadge}
        </div>
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? 'senha' : 'senhas'}
        </span>
      </div>

      {items.length === 0 ? (
        emptyMsg ? (
          <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted-foreground italic">
            {emptyMsg}
          </div>
        ) : null
      ) : (
        <ul className="space-y-2">
          {items.map(t => (
            <QueueRow
              key={t.id}
              ticket={t}
              variant={variant}
              callCooldownUntil={callCooldowns?.[t.id] ?? 0}
              onCall={onCall}
              onStart={onStart}
              onForward={onForward}
              onAssumeHandover={onAssumeHandover}
              onOpenAttend={onOpenAttend}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Linha da fila ──────────────────────────────────────────────────────────

function QueueRow({
  ticket, variant, callCooldownUntil = 0,
  onCall, onStart, onForward, onAssumeHandover, onOpenAttend,
}: {
  ticket: AttendanceItem
  variant: 'waiting' | 'inService' | 'rest'
  callCooldownUntil?: number
  onCall?: (t: AttendanceItem) => void
  onStart?: (t: AttendanceItem) => void
  onForward?: (t: AttendanceItem) => void
  onAssumeHandover?: (t: AttendanceItem) => void
  onOpenAttend?: (t: AttendanceItem) => void
}) {
  const needsHandover = !!ticket.needsHandoverFromAttendanceId
  const wasCalled = ticket.status === 'reception_called'
  const callDisabledSec = Math.max(0, Math.ceil((callCooldownUntil - Date.now()) / 1000))
  const callDisabled = callDisabledSec > 0

  return (
    <li className={cn(
      'bg-card border border-border rounded-xl p-3 flex items-center gap-4 transition-colors',
      wasCalled && 'border-sky-300 dark:border-sky-700 bg-sky-50/30 dark:bg-sky-950/20',
      variant === 'inService' && 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-950/20',
    )}>
      <span
        className="text-2xl font-black tabular-nums shrink-0 min-w-[5.5rem] cursor-pointer"
        style={{ color: ticket.priority ? '#dc2626' : '#0d9488' }}
        onClick={() => onOpenAttend?.(ticket)}
      >{ticket.ticketNumber}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-2">
          <button
            onClick={() => onOpenAttend?.(ticket)}
            className="hover:underline truncate"
          >
            {ticket.patientName || <span className="italic text-muted-foreground">Sem nome</span>}
          </button>
          {ticket.priority && (
            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-[10px] font-semibold uppercase tracking-wider">
              Prioridade
            </span>
          )}
          {needsHandover && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-[10px] font-semibold uppercase tracking-wider"
              title={ticket.handover?.facilityShortName
                ? `Veio de ${ticket.handover.facilityShortName}`
                : 'Handover pendente'}>
              <ShieldAlert size={10} /> Handover
            </span>
          )}
          {wasCalled && (
            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-[10px] font-semibold uppercase tracking-wider">
              Chamado
            </span>
          )}
          {ticket.status === 'triagem_waiting' && (
            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-wider">
              Triagem
            </span>
          )}
          {ticket.status === 'sector_waiting' && ticket.sectorName && (
            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-wider">
              {ticket.sectorName}
            </span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock size={11} />
          <WaitLabel sinceIso={ticket.arrivedAt} />
          {ticket.docType === 'cpf' && ticket.docValue && ` · CPF ${maskCpf(ticket.docValue)}`}
          {ticket.docType === 'cns' && ticket.docValue && ` · CNS ${maskCns(ticket.docValue)}`}
          {ticket.orderReasons && ticket.orderReasons.length > 0 && (
            <OrderReasonsTooltip reasons={ticket.orderReasons} />
          )}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {variant === 'waiting' && needsHandover && (
          <button
            onClick={() => onAssumeHandover?.(ticket)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
            title="Confirma que o paciente chegou nesta unidade"
          >
            <UserCheck size={13} /> Presença
          </button>
        )}
        {variant === 'waiting' && (
          <>
            {onCall && (
              <button
                onClick={() => onCall(ticket)}
                disabled={callDisabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title={wasCalled ? 'Rechamar no painel' : 'Chamar no painel'}
              >
                <PhoneCall size={13} />
                {callDisabled
                  ? `Aguarde ${callDisabledSec}s`
                  : wasCalled ? 'Rechamar' : 'Chamar'}
              </button>
            )}
            {onStart && (
              <button
                onClick={() => onOpenAttend?.(ticket)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 size={13} /> Atender
              </button>
            )}
          </>
        )}
        {variant === 'inService' && (
          <>
            {onCall && (
              <button
                onClick={() => onCall(ticket)}
                disabled={callDisabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="Anuncia de novo no painel — sem mexer no status"
              >
                <PhoneCall size={13} />
                {callDisabled ? `Aguarde ${callDisabledSec}s` : 'Rechamar'}
              </button>
            )}
            {onOpenAttend && (
              <button
                onClick={() => onOpenAttend(ticket)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Abrir ficha do paciente pra continuar o atendimento"
              >
                <CheckCircle2 size={13} /> Atender
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

// ─── Modal: atender (confirmar dados) ──────────────────────────────────────

function AttendModal({
  ticket, counter, onClose, onCall, onStart, onAssumeHandover, onForward,
}: {
  ticket: AttendanceItem
  counter: string
  onClose: () => void
  onCall: (t: AttendanceItem) => void
  onStart: (t: AttendanceItem) => void
  onAssumeHandover: (t: AttendanceItem) => void
  onForward: (t: AttendanceItem) => void
}) {
  const needsHandover = !!ticket.needsHandoverFromAttendanceId
  const canStart = !needsHandover && (ticket.status === 'reception_called' || ticket.status === 'reception_waiting')
  const canCall = ticket.status === 'reception_waiting'
  const canForward = ticket.status === 'reception_attending'
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-xl shadow-xl border border-border w-full max-w-md overflow-hidden">
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            {counter && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{counter}</span>
            )}
            <h3 className="text-lg font-bold tabular-nums"
              style={{ color: ticket.priority ? '#dc2626' : '#0d9488' }}>
              {ticket.ticketNumber}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-muted overflow-hidden flex items-center justify-center text-muted-foreground shrink-0">
              {ticket.patientId ? (
                <PatientPhotoImg
                  patientId={ticket.patientId}
                  alt={ticket.patientName}
                  className="w-full h-full object-cover"
                  fallback={<span className="text-2xl font-bold">{initials(ticket.patientName)}</span>}
                />
              ) : (
                <span className="text-2xl font-bold">{initials(ticket.patientName)}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{ticket.patientName || '—'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ticket.docType === 'cpf' && ticket.docValue && `CPF ${maskCpf(ticket.docValue)}`}
                {ticket.docType === 'cns' && ticket.docValue && `CNS ${maskCns(ticket.docValue)}`}
                {ticket.docType === 'manual' && 'Cadastro manual'}
              </p>
              {ticket.priority && (
                <span className="inline-flex mt-1 items-center px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-[10px] font-semibold uppercase tracking-wider">
                  Prioridade
                </span>
              )}
            </div>
          </div>

          {needsHandover && ticket.handover && (
            <div className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-amber-900 dark:text-amber-200">
                Paciente tem atendimento aberto em{' '}
                <strong>{ticket.handover.facilityShortName}</strong>.
                Confirme a presença pra liberar o atendimento aqui.
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {needsHandover && (
              <button
                onClick={() => onAssumeHandover(ticket)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
              >
                <UserCheck size={14} /> Confirmar presença
              </button>
            )}
            {canCall && (
              <button
                onClick={() => onCall(ticket)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold"
              >
                <PhoneCall size={14} /> Chamar{counter && ` (${counter})`}
              </button>
            )}
            {canStart && (
              <button
                onClick={() => onStart(ticket)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                <CheckCircle2 size={14} /> Atender
              </button>
            )}
            {canForward && (
              <button
                onClick={() => onForward(ticket)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
              >
                <ArrowRight size={14} /> Encaminhar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: encaminhar pra setor ────────────────────────────────────────────

function ForwardModal({
  ticket, sectors, allowedSectorNames, suggestedSector, onClose, onConfirm,
}: {
  ticket: AttendanceItem
  sectors: Sector[]
  /** ``null`` = todos permitidos. Lista = só estes aparecem. */
  allowedSectorNames: string[] | null
  suggestedSector: string | null
  onClose: () => void
  onConfirm: (sector: string) => void
}) {
  // Filtra pelo que o admin liberou na config. Sugerido sempre aparece
  // (mesmo que fora da lista) pra não sumir silenciosamente.
  const allowed = allowedSectorNames === null
    ? sectors
    : sectors.filter(s => allowedSectorNames.includes(s.name))
  const visibleSectors = suggestedSector
    && !allowed.some(s => s.name === suggestedSector)
    && sectors.find(s => s.name === suggestedSector)
    ? [...allowed, sectors.find(s => s.name === suggestedSector)!]
    : allowed
  const suggestedInList = suggestedSector
    && visibleSectors.some(s => s.name === suggestedSector)
  const initial = suggestedInList
    ? suggestedSector!
    : (visibleSectors[0]?.name ?? 'Triagem')
  const [selected, setSelected] = useState<string>(initial)

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-xl shadow-xl border border-border w-full max-w-sm overflow-hidden">
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Encaminhar {ticket.ticketNumber}</h3>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">Setor destino</p>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
            {visibleSectors.length === 0 && (
              <button
                onClick={() => setSelected('Triagem')}
                className={cn(
                  'px-3 py-2 rounded-lg border text-sm text-left',
                  selected === 'Triagem'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted',
                )}
              >
                Triagem
              </button>
            )}
            {visibleSectors.map(s => {
              const isSuggested = s.name === suggestedSector
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.name)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm text-left transition-colors relative',
                    selected === s.name
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    {isSuggested && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Sugerido
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {suggestedSector && !suggestedInList && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Setor sugerido ("{suggestedSector}") não está mais disponível.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(selected)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              Encaminhar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: configuração do guichê ─────────────────────────────────────────



function CounterConfigModal({
  initial, onClose, onSave, onClear,
}: {
  initial: CounterConfig | null
  onClose: () => void
  onSave: (cfg: CounterConfig) => void
  onClear: () => void
}) {
  const [number, setNumber] = useState(initial?.number ?? '')
  const [priority, setPriority] = useState(initial?.priority ?? false)
  const canSave = number.trim().length > 0
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-xl shadow-xl border border-border w-full max-w-sm overflow-hidden">
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Configurar guichê</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Opcional. Se deixar em branco, as chamadas não mostram guichê
              no painel — útil pra unidades com só 1 ponto.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </header>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Nome
            </label>
            <input
              type="text"
              value={number}
              onChange={e => setNumber(e.target.value)}
              placeholder="Ex.: Guichê 1, Acolhimento, Balcão"
              maxLength={40}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Aparece exatamente como digitado no painel de chamadas.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/40">
            <input
              type="checkbox"
              checked={priority}
              onChange={e => setPriority(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary/40"
            />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">Guichê prioritário</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                Atende idosos, gestantes, PCD etc. preferencialmente.
              </span>
            </span>
          </label>

          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              {initial && (
                <button
                  onClick={onClear}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Remover configuração
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => canSave && onSave({ number: number.trim(), priority })}
                disabled={!canSave}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── Componentes auxiliares ─────────────────────────────────────────────────

function OrderReasonsTooltip({ reasons }: { reasons: OrderReason[] }) {
  const [open, setOpen] = useState(false)
  if (reasons.length === 0) return null
  // Score total pra dar contexto no topo
  const total = reasons.reduce((s, r) => s + r.contrib, 0)
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        onBlur={() => setOpen(false)}
        className="ml-1 text-violet-500 hover:text-violet-700 dark:hover:text-violet-400 transition-colors"
        title="Por que esta ordem?"
      >
        <Info size={11} />
      </button>
      {open && (
        <span className="absolute left-0 top-4 z-20 min-w-[220px] rounded-lg border border-border bg-popover shadow-lg p-2.5 text-[11px] text-left">
          <span className="block font-semibold text-foreground mb-1.5 pb-1.5 border-b border-border">
            Score: {total.toFixed(2)}
          </span>
          <span className="block space-y-1">
            {reasons.map((r, i) => (
              <span key={i} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-foreground">{humanReason(r.tag)}</span>
                  {r.note && (
                    <span className="block text-muted-foreground italic text-[10px]">
                      {r.note}
                    </span>
                  )}
                </span>
                <span className={cn(
                  'font-mono tabular-nums font-semibold shrink-0',
                  r.contrib > 0 ? 'text-emerald-600 dark:text-emerald-400'
                  : r.contrib < 0 ? 'text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground',
                )}>
                  {r.contrib > 0 ? '+' : ''}{r.contrib.toFixed(2)}
                </span>
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}

function humanReason(tag: string): string {
  if (tag === 'prioridade_legal') return 'Prioridade legal'
  if (tag === 'handover_pendente') return 'Handover pendente'
  if (tag === 'espera_prolongada') return 'Espera prolongada'
  if (tag === 'fairness_cap') return 'Damping de prioridade'
  if (tag.startsWith('esperando_')) {
    const min = tag.replace('esperando_', '').replace('min', '')
    return `Esperando ${min} min`
  }
  return tag
}

function WaitLabel({ sinceIso }: { sinceIso: string }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick(t => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const since = new Date(sinceIso).getTime()
  const min = Math.max(0, Math.floor((Date.now() - since) / 60_000))
  if (min < 1) return <>agora</>
  if (min < 60) return <>há {min} min</>
  const h = Math.floor(min / 60)
  return <>há {h}h {min % 60}min</>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function maskCpf(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (digits.length !== 11) return v
  return `***.***.***-${digits.slice(-2)}`
}

function maskCns(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (digits.length < 4) return v
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`
}
