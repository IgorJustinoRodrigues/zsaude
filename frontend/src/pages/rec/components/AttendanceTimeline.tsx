// Linha do tempo do atendimento. Busca ``GET /rec/tickets/:id/events``
// e exibe em formato vertical com ícones, timestamp relativo e detalhes
// contextuais (setor encaminhado, motivo do cancel, etc.).

import { useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowRight, Camera, CheckCircle2, Edit3, FileEdit, Loader2,
  LogIn, MessageSquare, PhoneCall, Repeat2, RotateCcw, Send, UserCheck, X,
} from 'lucide-react'
import { recApi, type AttendanceEventOut } from '../../../api/rec'
import { HttpError } from '../../../api/client'
import { cn } from '../../../lib/utils'

interface Props {
  ticketId: string
  /** Dispara refetch quando mudar — use pra sincronizar após ações
   *  que geram novos eventos (call/forward/cancel). */
  refreshToken?: unknown
}

export function AttendanceTimeline({ ticketId, refreshToken }: Props) {
  const [events, setEvents] = useState<AttendanceEventOut[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setErr(null)
    recApi.ticketEvents(ticketId)
      .then(list => { if (!cancelled) setEvents(list) })
      .catch(e => { if (!cancelled) setErr(e instanceof HttpError ? e.message : 'Erro') })
    return () => { cancelled = true }
  }, [ticketId, refreshToken])

  if (err) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <AlertTriangle size={12} /> {err}
      </div>
    )
  }
  if (events === null) {
    return (
      <div className="py-6 flex items-center justify-center text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }
  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Sem eventos registrados ainda.
      </p>
    )
  }

  return (
    <ol className="relative space-y-0">
      {events.map((ev, i) => {
        const last = i === events.length - 1
        const style = EVENT_STYLES[ev.eventType] ?? EVENT_STYLES.default
        return (
          <li key={ev.id} className="relative flex gap-3 pb-4">
            {!last && (
              <span
                className="absolute left-[15px] top-8 bottom-0 w-px bg-border"
                aria-hidden
              />
            )}
            <span className={cn(
              'relative z-[1] w-8 h-8 rounded-full flex items-center justify-center shrink-0',
              style.bg, style.fg,
            )}>
              {style.icon}
            </span>
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-sm font-medium leading-tight">
                {style.label}
                {summarizeDetails(ev) && (
                  <span className="font-normal text-muted-foreground">
                    {' · '}{summarizeDetails(ev)}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatTimelineDate(ev.createdAt)}
                {ev.userName?.trim() && ` · ${ev.userName}`}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─── Estilo por tipo ────────────────────────────────────────────────────

type EventStyle = {
  icon: React.ReactNode
  label: string
  bg: string
  fg: string
}

const EVENT_STYLES: Record<string, EventStyle> = {
  arrived: {
    icon: <LogIn size={14} />, label: 'Chegou na recepção',
    bg: 'bg-slate-100 dark:bg-slate-800', fg: 'text-slate-700 dark:text-slate-300',
  },
  called: {
    icon: <PhoneCall size={14} />, label: 'Chamado no painel',
    bg: 'bg-sky-100 dark:bg-sky-950', fg: 'text-sky-700 dark:text-sky-300',
  },
  recalled: {
    icon: <Repeat2 size={14} />, label: 'Rechamado',
    bg: 'bg-sky-100 dark:bg-sky-950', fg: 'text-sky-700 dark:text-sky-300',
  },
  started: {
    icon: <CheckCircle2 size={14} />, label: 'Atendimento iniciado',
    bg: 'bg-emerald-100 dark:bg-emerald-950', fg: 'text-emerald-700 dark:text-emerald-300',
  },
  forwarded: {
    icon: <ArrowRight size={14} />, label: 'Encaminhado',
    bg: 'bg-indigo-100 dark:bg-indigo-950', fg: 'text-indigo-700 dark:text-indigo-300',
  },
  retriagem_requested: {
    icon: <RotateCcw size={14} />, label: 'Retriagem solicitada',
    bg: 'bg-violet-100 dark:bg-violet-950', fg: 'text-violet-700 dark:text-violet-300',
  },
  referred: {
    icon: <Send size={14} />, label: 'Encaminhado pra UBS',
    bg: 'bg-amber-100 dark:bg-amber-950', fg: 'text-amber-700 dark:text-amber-300',
  },
  cancelled: {
    icon: <X size={14} />, label: 'Cancelado',
    bg: 'bg-rose-100 dark:bg-rose-950', fg: 'text-rose-700 dark:text-rose-300',
  },
  evaded: {
    icon: <X size={14} />, label: 'Evadiu-se',
    bg: 'bg-amber-100 dark:bg-amber-950', fg: 'text-amber-700 dark:text-amber-300',
  },
  handover_assumed: {
    icon: <UserCheck size={14} />, label: 'Presença confirmada (handover)',
    bg: 'bg-amber-100 dark:bg-amber-950', fg: 'text-amber-700 dark:text-amber-300',
  },
  photo_uploaded: {
    icon: <Camera size={14} />, label: 'Foto atualizada',
    bg: 'bg-fuchsia-100 dark:bg-fuchsia-950', fg: 'text-fuchsia-700 dark:text-fuchsia-300',
  },
  data_updated: {
    icon: <FileEdit size={14} />, label: 'Dados atualizados',
    bg: 'bg-slate-100 dark:bg-slate-800', fg: 'text-slate-700 dark:text-slate-300',
  },
  note_added: {
    icon: <MessageSquare size={14} />, label: 'Observação adicionada',
    bg: 'bg-slate-100 dark:bg-slate-800', fg: 'text-slate-700 dark:text-slate-300',
  },
  default: {
    icon: <Edit3 size={14} />, label: 'Evento',
    bg: 'bg-slate-100 dark:bg-slate-800', fg: 'text-slate-600 dark:text-slate-400',
  },
}

function summarizeDetails(ev: AttendanceEventOut): string | null {
  const d = ev.details ?? {}
  if (ev.eventType === 'forwarded' && typeof d.sectorName === 'string') {
    const base = `setor ${d.sectorName}`
    if (d.reason === 'retriagem_completed' && typeof d.retriagemNumber === 'number') {
      return `${base} · ${d.retriagemNumber}ª triagem`
    }
    if (typeof d.risk === 'number') {
      return `${base} · risco ${d.risk}`
    }
    return base
  }
  if (ev.eventType === 'retriagem_requested' && typeof d.fromStatus === 'string') {
    return `de ${d.fromStatus}`
  }
  if (ev.eventType === 'referred' && typeof d.ubsName === 'string') {
    return d.ubsName
  }
  if (ev.eventType === 'cancelled' && typeof d.reason === 'string') {
    return `motivo: ${d.reason}`
  }
  if (ev.eventType === 'arrived' && typeof d.source === 'string') {
    return d.source === 'totem' ? 'via totem' : 'cadastro manual'
  }
  if (ev.eventType === 'handover_assumed' && typeof d.fromFacility === 'string') {
    return `veio de ${d.fromFacility}`
  }
  if (ev.eventType === 'data_updated' && Array.isArray(d.fields)) {
    const list = d.fields as string[]
    if (list.length <= 3) return list.join(', ')
    return `${list.slice(0, 3).join(', ')} +${list.length - 3}`
  }
  if (ev.eventType === 'photo_uploaded' && typeof d.faceStatus === 'string') {
    return `face: ${d.faceStatus}`
  }
  return null
}

function formatTimelineDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Hoje às ${time}`
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Ontem às ${time}`
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
