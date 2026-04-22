// Console da recepcionista. Lista senhas ativas da unidade, permite
// chamar/atender/encaminhar/cancelar + confirmar presença em handover
// cross-unidade.
//
// Por enquanto usa polling (5s). WS real-time pode vir depois — humano
// opera em minutos, então 5s é suficiente.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, PhoneCall, ShieldAlert,
  Sparkles, UserCheck, X,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { HttpError } from '../../api/client'
import { recApi, type AttendanceItem } from '../../api/rec'
import { sectorsApi, type Sector } from '../../api/sectors'
import { PatientPhotoImg } from '../hsp/components/PatientPhotoImg'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const COUNTERS = ['Guichê 1', 'Guichê 2', 'Guichê 3'] as const
const POLL_MS = 5_000

export function RecQueuePage() {
  const [counter, setCounter] = useState<string>(COUNTERS[0])
  const [tickets, setTickets] = useState<AttendanceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sectors, setSectors] = useState<Sector[]>([])
  const [attendModal, setAttendModal] = useState<AttendanceItem | null>(null)
  const [forwardModal, setForwardModal] = useState<AttendanceItem | null>(null)
  const [cancelModal, setCancelModal] = useState<AttendanceItem | null>(null)

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

  useEffect(() => {
    void reload()
    void sectorsApi.effective().then(r => setSectors(r.sectors)).catch(() => {})
    const id = window.setInterval(reload, POLL_MS)
    return () => window.clearInterval(id)
  }, [reload])

  // Separa em grupos: aguardando, em atendimento, outros (triagem/sector).
  const { waiting, inService, rest } = useMemo(() => {
    const w: AttendanceItem[] = []
    const s: AttendanceItem[] = []
    const r: AttendanceItem[] = []
    for (const t of tickets) {
      if (t.status === 'reception_waiting' || t.status === 'reception_called') w.push(t)
      else if (t.status === 'reception_attending') s.push(t)
      else r.push(t)
    }
    return { waiting: w, inService: s, rest: r }
  }, [tickets])

  async function doCall(t: AttendanceItem) {
    try {
      await recApi.callTicket(t.id)
      // Publica no painel — o backend também já faz isso, mas o publishCall
      // respeita o guichê escolhido pela atendente (que o backend não sabe).
      await recApi.publishCall({
        ticket: t.ticketNumber, counter,
        patientName: t.patientName, priority: t.priority,
      }).catch(() => {})
      void reload()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Chamar', err.message)
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

  async function doCancel(t: AttendanceItem, reason: string) {
    try {
      await recApi.cancelTicket(t.id, reason)
      void reload()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Cancelar', err.message)
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

  function testCall() {
    const priority = Math.random() < 0.25
    const ticket = `${priority ? 'P' : 'R'}-${String(Math.floor(Math.random() * 900) + 100)}`
    recApi.publishCall({
      ticket, counter, patientName: 'Teste', priority,
    }).then(
      () => toast.success('Chamada enviada', ticket),
      () => toast.error('Painel', 'Falha ao enviar chamada.'),
    )
  }

  return (
    <div>
      <PageHeader title="Recepção" subtitle="Senhas ativas da unidade" />

      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          {COUNTERS.map(c => (
            <button
              key={c}
              onClick={() => setCounter(c)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                counter === c
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >{c}</button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={testCall}
          title="Envia uma chamada aleatória pro painel"
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-300 font-medium text-xs hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
        >
          <Sparkles size={14} /> Testar chamada
        </button>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Carregando fila…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <section>
            <QueueSection
              title="Aguardando"
              items={waiting}
              counter={counter}
              emptyMsg="Ninguém aguardando no momento."
              onCall={doCall}
              onStart={doStart}
              onAssumeHandover={doAssumeHandover}
              onCancel={t => setCancelModal(t)}
              onOpenAttend={t => setAttendModal(t)}
            />

            {inService.length > 0 && (
              <>
                <div className="mt-8" />
                <QueueSection
                  title="Em atendimento"
                  items={inService}
                  counter={counter}
                  emptyMsg=""
                  variant="inService"
                  onForward={t => setForwardModal(t)}
                  onCancel={t => setCancelModal(t)}
                  onOpenAttend={t => setAttendModal(t)}
                />
              </>
            )}

            {rest.length > 0 && (
              <>
                <div className="mt-8" />
                <QueueSection
                  title="Encaminhados"
                  items={rest}
                  counter={counter}
                  emptyMsg=""
                  variant="rest"
                />
              </>
            )}
          </section>

          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Resumo
              </h3>
              <dl className="space-y-2 text-sm">
                <Stat label="Aguardando" value={waiting.length} />
                <Stat label="Em atendimento" value={inService.length} />
                <Stat label="Encaminhados" value={rest.length} />
                <Stat
                  label="Prioridade"
                  value={tickets.filter(t => t.priority).length}
                  tone="priority"
                />
                <Stat
                  label="Com handover"
                  value={tickets.filter(t => t.needsHandoverFromAttendanceId).length}
                  tone="warning"
                />
              </dl>
            </div>
          </aside>
        </div>
      )}

      {attendModal && (
        <AttendModal
          ticket={attendModal}
          counter={counter}
          onClose={() => setAttendModal(null)}
          onCall={async t => { await doCall(t); setAttendModal(null) }}
          onStart={async t => { await doStart(t); setAttendModal(null) }}
          onAssumeHandover={async t => { await doAssumeHandover(t) }}
          onForward={async t => { setAttendModal(null); setForwardModal(t) }}
        />
      )}
      {forwardModal && (
        <ForwardModal
          ticket={forwardModal}
          sectors={sectors}
          onClose={() => setForwardModal(null)}
          onConfirm={async sector => {
            await doForward(forwardModal, sector)
            setForwardModal(null)
          }}
        />
      )}
      {cancelModal && (
        <CancelModal
          ticket={cancelModal}
          onClose={() => setCancelModal(null)}
          onConfirm={async reason => {
            await doCancel(cancelModal, reason)
            setCancelModal(null)
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
  counter: string
  emptyMsg: string
  variant?: 'waiting' | 'inService' | 'rest'
  onCall?: (t: AttendanceItem) => void
  onStart?: (t: AttendanceItem) => void
  onForward?: (t: AttendanceItem) => void
  onCancel?: (t: AttendanceItem) => void
  onAssumeHandover?: (t: AttendanceItem) => void
  onOpenAttend?: (t: AttendanceItem) => void
}

function QueueSection({
  title, items, emptyMsg, variant = 'waiting',
  onCall, onStart, onForward, onCancel, onAssumeHandover, onOpenAttend,
}: QueueSectionProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
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
              onCall={onCall}
              onStart={onStart}
              onForward={onForward}
              onCancel={onCancel}
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
  ticket, variant,
  onCall, onStart, onForward, onCancel, onAssumeHandover, onOpenAttend,
}: {
  ticket: AttendanceItem
  variant: 'waiting' | 'inService' | 'rest'
  onCall?: (t: AttendanceItem) => void
  onStart?: (t: AttendanceItem) => void
  onForward?: (t: AttendanceItem) => void
  onCancel?: (t: AttendanceItem) => void
  onAssumeHandover?: (t: AttendanceItem) => void
  onOpenAttend?: (t: AttendanceItem) => void
}) {
  const needsHandover = !!ticket.needsHandoverFromAttendanceId
  const wasCalled = ticket.status === 'reception_called'

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
            {!wasCalled && onCall && (
              <button
                onClick={() => onCall(ticket)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
              >
                <PhoneCall size={13} /> Chamar
              </button>
            )}
            {wasCalled && onStart && (
              <button
                onClick={() => onOpenAttend?.(ticket)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 size={13} /> Atender
              </button>
            )}
          </>
        )}
        {variant === 'inService' && onForward && (
          <button
            onClick={() => onForward(ticket)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <ArrowRight size={13} /> Encaminhar
          </button>
        )}
        {variant !== 'rest' && onCancel && (
          <button
            onClick={() => onCancel(ticket)}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-rose-600 dark:hover:text-rose-400"
            title="Cancelar atendimento"
          >
            <X size={13} />
          </button>
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
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{counter}</span>
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
                <PhoneCall size={14} /> Chamar ({counter})
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
  ticket, sectors, onClose, onConfirm,
}: {
  ticket: AttendanceItem
  sectors: Sector[]
  onClose: () => void
  onConfirm: (sector: string) => void
}) {
  const [selected, setSelected] = useState<string>(sectors[0]?.name ?? 'Triagem')
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
            {sectors.length === 0 && (
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
            {sectors.map(s => (
              <button
                key={s.id}
                onClick={() => setSelected(s.name)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-sm text-left',
                  selected === s.name
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted',
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
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

// ─── Modal: cancelar ───────────────────────────────────────────────────────

function CancelModal({
  ticket, onClose, onConfirm,
}: {
  ticket: AttendanceItem
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-xl shadow-xl border border-border w-full max-w-sm overflow-hidden">
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Cancelar {ticket.ticketNumber}</h3>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <label className="block text-xs text-muted-foreground">
            Motivo (opcional)
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Ex.: paciente desistiu, erro de cadastro"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            maxLength={300}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">
              Voltar
            </button>
            <button
              onClick={() => onConfirm(reason.trim())}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
            >
              Cancelar atendimento
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ─────────────────────────────────────────────────

function Stat({
  label, value, tone = 'default',
}: { label: string; value: number; tone?: 'default' | 'priority' | 'warning' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(
        'font-semibold tabular-nums',
        tone === 'priority' && value > 0 && 'text-red-600 dark:text-red-400',
        tone === 'warning' && value > 0 && 'text-amber-600 dark:text-amber-400',
      )}>{value}</dd>
    </div>
  )
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
