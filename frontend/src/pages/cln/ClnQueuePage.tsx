// Fila do módulo Clínico. Duas versões (triagem / atendimento) —
// mesma UI, muda só o endpoint e as ações disponíveis.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, ArrowRight, CheckCircle2, Clock, History, PhoneCall, RotateCcw,
  Star, Stethoscope, UserX, X,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { clnApi, type ClnQueueItem, type EffectiveClnConfig } from '../../api/cln'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { promptDialog, confirmDialog } from '../../store/dialogStore'
import { cn } from '../../lib/utils'
import { AttendanceTimeline } from '../rec/components/AttendanceTimeline'
import { ProceduresSection } from './components/ProceduresSection'

const POLL_MS = 5_000
const ACTION_COOLDOWN_MS = 5_000

type Kind = 'triagem' | 'atendimento'
type Tab = 'fila' | 'encaminhados' | 'evadidos'

interface Props {
  kind: Kind
}

export function ClnQueuePage({ kind }: Props) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('fila')
  const [tickets, setTickets] = useState<ClnQueueItem[]>([])
  const [config, setConfig] = useState<EffectiveClnConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [callCooldowns, setCallCooldowns] = useState<Record<string, number>>({})
  const [timelineOpen, setTimelineOpen] = useState<ClnQueueItem | null>(null)
  const [proceduresOpen, setProceduresOpen] = useState<ClnQueueItem | null>(null)

  // Tick pra atualizar countdowns.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    try {
      // Escolhe o fetcher certo pela combinação kind × tab.
      const fetcher = (() => {
        if (kind === 'triagem') {
          if (tab === 'encaminhados') return clnApi.listTriagemEncaminhados
          if (tab === 'evadidos') return clnApi.listTriagemEvadidos
          return clnApi.listTriagem
        }
        if (tab === 'encaminhados') return clnApi.listAtendimentoEncaminhados
        if (tab === 'evadidos') return clnApi.listAtendimentoEvadidos
        return clnApi.listAtendimento
      })()
      const list = await fetcher()
      setTickets(list)
    } catch (err) {
      if (err instanceof HttpError) toast.error('Fila', err.message)
    } finally {
      setLoading(false)
    }
  }, [kind, tab])

  useEffect(() => {
    void clnApi.effectiveConfig()
      .then(setConfig)
      .catch(err => {
        console.error('[cln] effectiveConfig failed:', err)
        if (err instanceof HttpError) {
          toast.error('Config CLN', err.message)
        }
      })
    void load()
    const id = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  // Em atendimento = cln_called | cln_attending
  // Aguardando = demais (triagem_waiting | sector_waiting)
  const { active, waiting } = useMemo(() => {
    const a: ClnQueueItem[] = []
    const w: ClnQueueItem[] = []
    for (const t of tickets) {
      if (t.status === 'cln_called' || t.status === 'cln_attending') a.push(t)
      else w.push(t)
    }
    return { active: a, waiting: w }
  }, [tickets])

  // ── Ações ────────────────────────────────────────────────────────
  async function doCall(t: ClnQueueItem) {
    setCallCooldowns(m => ({ ...m, [t.id]: Date.now() + ACTION_COOLDOWN_MS }))
    try {
      await clnApi.call(t.id)
      toast.success('Chamado', t.ticketNumber)
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Chamar', err.message)
    }
  }

  async function doStart(t: ClnQueueItem) {
    try {
      await clnApi.start(t.id)
      toast.success('Atendendo', t.ticketNumber)
      // Em triagem, abre tela dedicada pra coletar sinais vitais +
      // classificação. Em atendimento, por enquanto só atualiza a fila.
      if (kind === 'triagem') {
        navigate(`/cln/triagem/${t.id}`)
      } else {
        void load()
      }
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.code === 'already_attending') {
          // Backend bloqueou: já tem outro ticket em atendimento por este
          // usuário. Oferece ir direto pra ele.
          const active = err.details?.activeTicket as
            | { id: string; ticketNumber: string; patientName: string } | undefined
          toast.warning(
            'Você já está atendendo',
            active
              ? `Senha ${active.ticketNumber} · ${active.patientName}. Libere ou finalize antes.`
              : err.message,
          )
          if (active && kind === 'triagem') {
            navigate(`/cln/triagem/${active.id}`)
          }
          return
        }
        toast.error('Atender', err.message)
      }
    }
  }

  async function doRelease(t: ClnQueueItem) {
    if (!config?.atendimentoSectorName) return
    const ok = await confirmDialog({
      title: 'Liberar pra atendimento?',
      message: `Senha ${t.ticketNumber} · ${t.patientName} vai pra fila de ${config.atendimentoSectorName}.`,
      confirmLabel: 'Liberar',
    })
    if (!ok) return
    try {
      await clnApi.release(t.id)
      toast.success('Liberado', `${t.ticketNumber} → ${config.atendimentoSectorName}`)
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Liberar', err.message)
    }
  }

  async function doFinish(t: ClnQueueItem) {
    const ok = await confirmDialog({
      title: 'Finalizar atendimento?',
      message: `Senha ${t.ticketNumber} · ${t.patientName}. Esta ação é definitiva.`,
      confirmLabel: 'Finalizar',
    })
    if (!ok) return
    try {
      await clnApi.finish(t.id)
      toast.success('Atendimento finalizado', t.ticketNumber)
      void load()
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.code === 'no_procedures_marked') {
          const confirm = await confirmDialog({
            title: 'Finalizar sem procedimento?',
            message: (
              'Nenhum procedimento SIGTAP foi marcado. ' +
              'Sem procedimento a BPA deste atendimento fica vazia. ' +
              'Tem certeza que quer finalizar assim?'
            ),
            confirmLabel: 'Finalizar mesmo assim',
            variant: 'danger',
          })
          if (!confirm) return
          try {
            await clnApi.finish(t.id, true)
            toast.success('Atendimento finalizado', t.ticketNumber)
            void load()
          } catch (err2) {
            if (err2 instanceof HttpError) toast.error('Finalizar', err2.message)
          }
          return
        }
        toast.error('Finalizar', err.message)
      }
    }
  }

  async function doCancel(t: ClnQueueItem) {
    const reason = await promptDialog({
      title: 'Cancelar atendimento',
      message: `Senha ${t.ticketNumber} · ${t.patientName}. Informe o motivo.`,
      placeholder: 'Ex.: paciente desistiu',
      confirmLabel: 'Cancelar atendimento',
      variant: 'danger',
    })
    if (!reason || reason.trim().length < 3) return
    try {
      await clnApi.cancel(t.id, reason.trim())
      toast.success('Cancelado', t.ticketNumber)
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Cancelar', err.message)
    }
  }

  async function doEvade(t: ClnQueueItem) {
    const ok = await confirmDialog({
      title: 'Marcar como evadido?',
      message: `Senha ${t.ticketNumber} · ${t.patientName} não retornou. Esta ação registra a evasão e fecha o atendimento.`,
      confirmLabel: 'Evadiu-se',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await clnApi.evade(t.id)
      toast.success('Evadido', t.ticketNumber)
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Evadiu-se', err.message)
    }
  }

  async function doRetriage(t: ClnQueueItem) {
    const ok = await confirmDialog({
      title: 'Devolver pra triagem?',
      message:
        `Senha ${t.ticketNumber} · ${t.patientName} volta pra fila de ` +
        `triagem pra ser reclassificada. O histórico da triagem anterior ` +
        `fica preservado.`,
      confirmLabel: 'Retriar',
    })
    if (!ok) return
    try {
      await clnApi.retriage(t.id)
      toast.success('Retriagem solicitada', t.ticketNumber)
      void load()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Retriar', err.message)
    }
  }

  const title = kind === 'triagem' ? 'Triagem' : 'Atendimento'
  const sector = kind === 'triagem'
    ? config?.triagemSectorName
    : config?.atendimentoSectorName

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={sector ? `Setor: ${sector}` : 'Setor não configurado'}
      />

      {!sector && config?.enabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 mb-4 text-xs text-amber-900 dark:text-amber-200">
          Setor não configurado — peça ao administrador pra ajustar no
          painel MASTER.
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-border bg-card p-1.5 w-fit">
        {([
          { id: 'fila', label: 'Fila' },
          { id: 'encaminhados', label: 'Encaminhados' },
          { id: 'evadidos', label: 'Evadidos' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && tickets.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : tab === 'fila' ? (
        <section className="space-y-6">
          {active.length > 0 && (
            <QueueSection
              title="Em atendimento"
              items={active}
              variant="active"
              kind={kind}
              callCooldowns={callCooldowns}
              onCall={doCall}
              onStart={doStart}
              onRelease={doRelease}
              onFinish={doFinish}
              onCancel={doCancel}
              onEvade={doEvade}
              onRetriage={doRetriage}
              onProcedures={t => setProceduresOpen(t)}
              onTimeline={t => setTimelineOpen(t)}
            />
          )}

          <QueueSection
            title="Aguardando"
            items={waiting}
            variant="waiting"
            kind={kind}
            emptyMsg="Ninguém aguardando no momento."
            callCooldowns={callCooldowns}
            onCall={doCall}
            onStart={doStart}
            onEvade={doEvade}
            onRetriage={doRetriage}
            onTimeline={t => setTimelineOpen(t)}
          />
        </section>
      ) : tab === 'encaminhados' ? (
        <QueueSection
          title="Encaminhados (últimas 24h)"
          items={tickets}
          variant="history"
          kind={kind}
          historyKind="forwarded"
          emptyMsg="Ninguém encaminhado nas últimas 24 horas."
          callCooldowns={{}}
          onRetriage={doRetriage}
          onTimeline={t => setTimelineOpen(t)}
        />
      ) : (
        <QueueSection
          title="Evadidos (últimos 7 dias)"
          items={tickets}
          variant="history"
          kind={kind}
          historyKind="evaded"
          emptyMsg="Ninguém evadiu nos últimos 7 dias."
          callCooldowns={{}}
          onTimeline={t => setTimelineOpen(t)}
        />
      )}

      {timelineOpen && (
        <TimelineModal
          ticket={timelineOpen}
          onClose={() => setTimelineOpen(null)}
        />
      )}
      {proceduresOpen && (
        <ProceduresModal
          ticket={proceduresOpen}
          onClose={() => setProceduresOpen(null)}
        />
      )}
    </div>
  )
}

// ─── Seção ──────────────────────────────────────────────────────────────

function QueueSection({
  title, items, variant, kind, emptyMsg, callCooldowns, historyKind,
  onCall, onStart, onRelease, onFinish, onCancel, onEvade, onRetriage,
  onProcedures, onTimeline,
}: {
  title: string
  items: ClnQueueItem[]
  variant: 'waiting' | 'active' | 'history'
  kind: Kind
  emptyMsg?: string
  callCooldowns: Record<string, number>
  /** Só pra variant=history: diferencia 'forwarded' (encaminhados) de
   *  'evaded' pra exibição correta. */
  historyKind?: 'forwarded' | 'evaded'
  onCall?: (t: ClnQueueItem) => void
  onStart?: (t: ClnQueueItem) => void
  onRelease?: (t: ClnQueueItem) => void
  onFinish?: (t: ClnQueueItem) => void
  onCancel?: (t: ClnQueueItem) => void
  onEvade?: (t: ClnQueueItem) => void
  onRetriage?: (t: ClnQueueItem) => void
  onProcedures?: (t: ClnQueueItem) => void
  onTimeline: (t: ClnQueueItem) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? 'senha' : 'senhas'}
        </span>
      </div>
      {items.length === 0 ? (
        emptyMsg ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground italic">
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
              kind={kind}
              historyKind={historyKind}
              callCooldownUntil={callCooldowns[t.id] ?? 0}
              onCall={onCall}
              onStart={onStart}
              onRelease={onRelease}
              onFinish={onFinish}
              onCancel={onCancel}
              onEvade={onEvade}
              onRetriage={onRetriage}
              onProcedures={onProcedures}
              onTimeline={onTimeline}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Linha ──────────────────────────────────────────────────────────────

function QueueRow({
  ticket, variant, kind, historyKind, callCooldownUntil,
  onCall, onStart, onRelease, onFinish, onCancel, onEvade, onRetriage,
  onProcedures, onTimeline,
}: {
  ticket: ClnQueueItem
  variant: 'waiting' | 'active' | 'history'
  kind: Kind
  historyKind?: 'forwarded' | 'evaded'
  callCooldownUntil: number
  onCall?: (t: ClnQueueItem) => void
  onStart?: (t: ClnQueueItem) => void
  onRelease?: (t: ClnQueueItem) => void
  onFinish?: (t: ClnQueueItem) => void
  onCancel?: (t: ClnQueueItem) => void
  onEvade?: (t: ClnQueueItem) => void
  onRetriage?: (t: ClnQueueItem) => void
  onProcedures?: (t: ClnQueueItem) => void
  onTimeline: (t: ClnQueueItem) => void
}) {
  const navigate = useNavigate()
  const wasCalled = ticket.status === 'cln_called'
  const attending = ticket.status === 'cln_attending'
  const callDisabledSec = Math.max(0, Math.ceil((callCooldownUntil - Date.now()) / 1000))
  const callDisabled = callDisabledSec > 0

  // Destino do clique: em triagem (e se o ticket já foi chamado/iniciado),
  // vai pra tela de triagem dedicada. Caso contrário, abre a ficha do
  // paciente na recepção (pra revisar dados cadastrais).
  const clickTarget: string | null = (() => {
    if (kind === 'triagem' && (wasCalled || attending)) return `/cln/triagem/${ticket.id}`
    if (ticket.patientId) return `/rec/atendimento/${ticket.patientId}`
    return null
  })()
  const openClickTarget = () => { if (clickTarget) navigate(clickTarget) }

  return (
    <li className={cn(
      'bg-card border border-border rounded-xl p-3 flex items-center gap-4 transition-colors',
      wasCalled && 'border-sky-300 dark:border-sky-700 bg-sky-50/30 dark:bg-sky-950/20',
      attending && 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-950/20',
    )}>
      <span
        className="text-2xl font-black tabular-nums shrink-0 min-w-[5.5rem] cursor-pointer"
        style={{ color: ticket.priority ? '#dc2626' : '#0d9488' }}
        onClick={openClickTarget}
        title={clickTarget ? 'Abrir' : undefined}
      >{ticket.ticketNumber}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-2">
          <button
            onClick={openClickTarget}
            className="hover:underline truncate text-left"
            disabled={!clickTarget}
          >
            {ticket.patientName || <span className="italic text-muted-foreground">Sem nome</span>}
          </button>
          {ticket.priority && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-[10px] font-semibold uppercase tracking-wider"
              title={ticket.priorityGroupLabel ?? undefined}
            >
              <Star size={9} /> {ticket.priorityGroupLabel || 'Prioridade'}
            </span>
          )}
          {ticket.triageCount >= 2 && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-[10px] font-semibold uppercase tracking-wider"
              title={`${ticket.triageCount}ª triagem deste atendimento`}
            >
              <RotateCcw size={9} /> {ticket.triageCount}ª triagem
            </span>
          )}
          {wasCalled && (
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-[10px] font-semibold uppercase tracking-wider">
              Chamado
            </span>
          )}
          {attending && (
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold uppercase tracking-wider">
              Em atendimento
            </span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock size={11} />
          <WaitLabel sinceIso={ticket.arrivedAt} />
          {ticket.startedByUserName && (wasCalled || attending) && (
            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
              <Stethoscope size={10} />
              Atendido por <strong className="font-bold">{ticket.startedByUserName}</strong>
            </span>
          )}
        </p>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onTimeline(ticket)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-muted transition-colors"
          title="Linha do tempo"
        >
          <History size={14} />
        </button>

        {variant === 'waiting' && (
          <>
            {onCall && (
              <button
                onClick={() => onCall(ticket)}
                disabled={callDisabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PhoneCall size={13} />
                {callDisabled ? `Aguarde ${callDisabledSec}s` : 'Chamar'}
              </button>
            )}
            {onStart && (
              <button
                onClick={() => onStart(ticket)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 size={13} /> Atender
              </button>
            )}
            {/* Atendimento: devolve pra triagem quando o quadro mudou. */}
            {kind === 'atendimento' && onRetriage && ticket.triageCount >= 1 && (
              <button
                onClick={() => onRetriage(ticket)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                title="Devolver pra triagem (retriagem)"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {onEvade && (
              <button
                onClick={() => onEvade(ticket)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                title="Evadiu-se (paciente não retornou)"
              >
                <UserX size={14} />
              </button>
            )}
          </>
        )}

        {variant === 'active' && (
          <>
            {onCall && (
              <button
                onClick={() => onCall(ticket)}
                disabled={callDisabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50"
                title="Rechamar no painel"
              >
                <PhoneCall size={13} />
                {callDisabled ? `Aguarde ${callDisabledSec}s` : 'Rechamar'}
              </button>
            )}
            {kind === 'triagem' && (
              <button
                onClick={() => navigate(`/cln/triagem/${ticket.id}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Abrir tela de triagem pra concluir"
              >
                <CheckCircle2 size={13} /> Atender
              </button>
            )}
            {kind === 'atendimento' && onProcedures && (
              <button
                onClick={() => onProcedures(ticket)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                title="Procedimentos SIGTAP"
              >
                <Activity size={14} />
              </button>
            )}
            {kind === 'atendimento' && onFinish && (
              <button
                onClick={() => onFinish(ticket)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Finaliza o atendimento"
              >
                <CheckCircle2 size={13} /> Finalizar
              </button>
            )}
            {kind === 'atendimento' && onRetriage && ticket.triageCount >= 1 && (
              <button
                onClick={() => onRetriage(ticket)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                title="Devolver pra triagem (retriagem)"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {onEvade && (
              <button
                onClick={() => onEvade(ticket)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                title="Evadiu-se (paciente não retornou)"
              >
                <UserX size={14} />
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(ticket)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                title="Cancelar atendimento"
              >
                <X size={14} />
              </button>
            )}
          </>
        )}

        {variant === 'history' && (
          <>
            {/* Retriar: só em triagem+encaminhados+ticket ainda ativo. */}
            {kind === 'triagem'
              && historyKind === 'forwarded'
              && onRetriage
              && (ticket.status === 'sector_waiting'
                || ticket.status === 'cln_called'
                || ticket.status === 'cln_attending') && (
              <button
                onClick={() => onRetriage(ticket)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                title="Devolver pra triagem (paciente piorou / reclassificar)"
              >
                <RotateCcw size={13} /> Retriar
              </button>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold',
                historyKind === 'evaded'
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {historyKind === 'evaded' ? (
                <><UserX size={11} /> Evadiu-se</>
              ) : (
                <><ArrowRight size={11} /> {ticket.sectorName ?? 'Encaminhado'}</>
              )}
            </span>
          </>
        )}
      </div>
    </li>
  )
}

// ─── Modal Timeline ─────────────────────────────────────────────────────

function TimelineModal({
  ticket, onClose,
}: { ticket: ClnQueueItem; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
      >
        <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold">Linha do tempo</h3>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: ticket.priority ? '#dc2626' : '#0d9488' }}
              >{ticket.ticketNumber}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {ticket.patientName || 'Sem nome'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>
        <div className="p-5 overflow-y-auto flex-1">
          <AttendanceTimeline ticketId={ticket.id} />
        </div>
      </div>
    </div>
  )
}

// ─── Modal Procedimentos (atendimento) ──────────────────────────────────

function ProceduresModal({
  ticket, onClose,
}: { ticket: ClnQueueItem; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold">Procedimentos</h3>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: ticket.priority ? '#dc2626' : '#0d9488' }}
              >{ticket.ticketNumber}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {ticket.patientName || 'Sem nome'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>
        <div className="p-5 overflow-y-auto flex-1">
          <ProceduresSection ticketId={ticket.id} />
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

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
