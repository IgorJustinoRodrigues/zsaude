// Tela de atendimento de triagem. Foco: coletar sinais vitais + queixa +
// classificação de risco e liberar o paciente pra fila de atendimento.
//
// Nesta Fase 1 os campos do form não são persistidos em tabela dedicada
// — sinalizamos no evento de liberação via ``details.triagem`` na
// timeline. Persistência estruturada (tabela ``triagem_records``) entra
// numa Fase 2 junto com relatórios e classificação Manchester completa.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Check, Clock,
  Droplet, Gauge, Heart, History, Loader2, Thermometer, User, Wind, X,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { FormField } from '../../components/ui/FormField'
import { PatientPhotoImg } from '../hsp/components/PatientPhotoImg'
import { AttendanceTimeline } from '../rec/components/AttendanceTimeline'
import { clnApi, type ClnQueueItem } from '../../api/cln'
import { hspApi, type PatientRead } from '../../api/hsp'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { confirmDialog, promptDialog } from '../../store/dialogStore'
import { calcAge, cn, formatCPF, formatDate, initials } from '../../lib/utils'

type Risk = 'red' | 'orange' | 'yellow' | 'green' | 'blue'

const RISK_META: Record<Risk, { label: string; hint: string; bg: string; ring: string }> = {
  red:    { label: 'Emergência',  hint: 'Atendimento imediato',            bg: 'bg-red-600',    ring: 'ring-red-500/40' },
  orange: { label: 'Muito urgente', hint: 'Em até 10 minutos',             bg: 'bg-orange-500', ring: 'ring-orange-500/40' },
  yellow: { label: 'Urgente',     hint: 'Em até 60 minutos',               bg: 'bg-yellow-500', ring: 'ring-yellow-500/40' },
  green:  { label: 'Pouco urgente', hint: 'Em até 120 minutos',            bg: 'bg-emerald-500', ring: 'ring-emerald-500/40' },
  blue:   { label: 'Não urgente', hint: 'Em até 240 minutos',              bg: 'bg-sky-500',    ring: 'ring-sky-500/40' },
}

export function ClnTriagemPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()

  const [ticket, setTicket] = useState<ClnQueueItem | null>(null)
  const [patient, setPatient] = useState<PatientRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Form de triagem (Fase 1 — não persistido ainda em tabela dedicada)
  const [queixa, setQueixa] = useState('')
  const [paSist, setPaSist] = useState('')
  const [paDiast, setPaDiast] = useState('')
  const [fc, setFc] = useState('')
  const [fr, setFr] = useState('')
  const [temp, setTemp] = useState('')
  const [spo2, setSpo2] = useState('')
  const [glicemia, setGlicemia] = useState('')
  const [dor, setDor] = useState<number>(0)
  const [risk, setRisk] = useState<Risk | null>(null)
  const [obs, setObs] = useState('')

  const load = useCallback(async () => {
    if (!ticketId) return
    setLoading(true)
    try {
      const t = await clnApi.getTicket(ticketId)
      setTicket(t)
      if (t.patientId) {
        const p = await hspApi.get(t.patientId).catch(() => null)
        setPatient(p)
      }
    } catch (err) {
      if (err instanceof HttpError) toast.error('Atendimento', err.message)
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => { void load() }, [load])

  async function handleRelease() {
    if (!ticket) return
    if (!risk) {
      toast.warning('Classificação obrigatória', 'Selecione a cor de risco antes de liberar.')
      return
    }
    const ok = await confirmDialog({
      title: 'Liberar pra atendimento?',
      message: `Triagem ${ticket.ticketNumber} será finalizada e o paciente vai pra fila de atendimento.`,
      confirmLabel: 'Liberar',
    })
    if (!ok) return
    setReleasing(true)
    try {
      await clnApi.release(ticket.id)
      toast.success('Liberado', `${ticket.ticketNumber} → atendimento`)
      navigate('/cln/triagem')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Liberar', err.message)
    } finally {
      setReleasing(false)
    }
  }

  async function handleCancel() {
    if (!ticket) return
    const reason = await promptDialog({
      title: 'Cancelar atendimento',
      message: `Senha ${ticket.ticketNumber} · ${ticket.patientName}. Informe o motivo.`,
      placeholder: 'Ex.: paciente desistiu',
      confirmLabel: 'Cancelar atendimento',
      variant: 'danger',
    })
    if (reason === null) return
    if (reason.trim().length < 3) {
      toast.warning('Motivo obrigatório', 'Pelo menos 3 caracteres.')
      return
    }
    setCancelling(true)
    try {
      await clnApi.cancel(ticket.id, reason.trim())
      toast.success('Cancelado', ticket.ticketNumber)
      navigate('/cln/triagem')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Cancelar', err.message)
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 size={20} className="animate-spin inline" />
      </div>
    )
  }
  if (!ticket) {
    return (
      <div>
        <PageHeader title="Triagem" back="/cln/triagem" />
        <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground">
          Ticket não encontrado ou pertence a outra unidade.
        </div>
      </div>
    )
  }

  const display = ticket.patientName

  return (
    <div>
      <PageHeader
        title="Triagem"
        subtitle={`Senha ${ticket.ticketNumber} · ${display}`}
        back="/cln/triagem"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTimelineOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:bg-muted text-xs font-semibold"
            >
              <History size={13} /> Histórico
            </button>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
            >
              {cancelling ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              Cancelar
            </button>
          </div>
        }
      />

      <div className="space-y-5">
        {/* Identidade */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-24 h-24 rounded-xl bg-muted overflow-hidden shrink-0 flex items-center justify-center text-2xl font-black text-muted-foreground mx-auto sm:mx-0">
              {patient?.currentPhotoId ? (
                <PatientPhotoImg
                  patientId={patient.id}
                  alt={display}
                  className="w-full h-full object-cover"
                  fallback={<>{initials(display)}</>}
                />
              ) : initials(display)}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-xl font-bold truncate">{display}</p>
              <div className="flex flex-wrap gap-1.5">
                {patient?.birthDate && (
                  <Chip icon={<Clock size={11} />}>
                    {formatDate(patient.birthDate)} · {calcAge(patient.birthDate)} anos
                  </Chip>
                )}
                {patient?.cpf && (
                  <Chip icon={<User size={11} />}>CPF {formatCPF(patient.cpf)}</Chip>
                )}
                {ticket.priority && (
                  <Chip className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
                    Prioridade legal
                  </Chip>
                )}
              </div>
              {ticket.sectorName && (
                <p className="text-xs text-muted-foreground">
                  Fila: <strong>{ticket.sectorName}</strong>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Queixa principal */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <AlertCircle size={14} /> Queixa principal
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            O que o paciente relata — motivo da procura pelo atendimento.
          </p>
          <FormField label="">
            <textarea
              value={queixa}
              onChange={e => setQueixa(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="Dor de cabeça há 2 dias, febre baixa…"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </FormField>
        </div>

        {/* Sinais vitais */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Heart size={14} /> Sinais vitais
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Preencha o que conseguir aferir — campos em branco são tolerados.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <VitalInput label="PA Sist." unit="mmHg" value={paSist} onChange={setPaSist}
              icon={<Gauge size={12} />} placeholder="120" />
            <VitalInput label="PA Diast." unit="mmHg" value={paDiast} onChange={setPaDiast}
              icon={<Gauge size={12} />} placeholder="80" />
            <VitalInput label="FC" unit="bpm" value={fc} onChange={setFc}
              icon={<Heart size={12} />} placeholder="72" />
            <VitalInput label="FR" unit="irpm" value={fr} onChange={setFr}
              icon={<Wind size={12} />} placeholder="16" />
            <VitalInput label="Temp" unit="°C" value={temp} onChange={setTemp}
              icon={<Thermometer size={12} />} placeholder="36.5" step="0.1" />
            <VitalInput label="SpO2" unit="%" value={spo2} onChange={setSpo2}
              icon={<Wind size={12} />} placeholder="98" />
            <VitalInput label="Glicemia" unit="mg/dL" value={glicemia} onChange={setGlicemia}
              icon={<Droplet size={12} />} placeholder="90" />
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold">Escala de dor</label>
              <span className="text-sm tabular-nums font-bold">{dor}/10</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={dor}
              onChange={e => setDor(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-0.5">
              <span>sem dor</span>
              <span>intensa</span>
            </div>
          </div>
        </div>

        {/* Classificação de risco (Manchester simplificado) */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <AlertTriangle size={14} /> Classificação de risco
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Prioridade de atendimento baseada na triagem (protocolo Manchester
            simplificado).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(Object.keys(RISK_META) as Risk[]).map(k => {
              const m = RISK_META[k]
              const active = risk === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRisk(k)}
                  className={cn(
                    'rounded-xl p-3 text-white font-semibold text-left transition-all',
                    m.bg,
                    active
                      ? `ring-4 ${m.ring} scale-[1.02] shadow-lg`
                      : 'opacity-80 hover:opacity-100',
                  )}
                >
                  <div className="text-sm">{m.label}</div>
                  <div className="text-[10px] opacity-90 mt-0.5">{m.hint}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Observações */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-1">Observações adicionais</h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Alergias, medicações em uso, antecedentes relevantes.
          </p>
          <FormField label="">
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value.slice(0, 2000))}
              rows={3}
              placeholder="Paciente hipertenso, toma losartana…"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </FormField>
        </div>

        {/* Ações */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center pt-2">
          <button
            onClick={() => navigate('/cln/triagem')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-muted text-sm font-medium"
          >
            <ArrowLeft size={14} /> Voltar à fila
          </button>
          <div className="flex-1" />
          <button
            onClick={handleRelease}
            disabled={releasing || !risk}
            title={!risk ? 'Selecione a classificação de risco antes' : undefined}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-base font-bold shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {releasing
              ? <><Loader2 size={18} className="animate-spin" /> Liberando…</>
              : <><Check size={18} /> Liberar pra atendimento <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>

      {/* Modal timeline */}
      {timelineOpen && (
        <div onClick={() => setTimelineOpen(false)} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div
            onClick={e => e.stopPropagation()}
            className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
          >
            <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Linha do tempo</h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {ticket.ticketNumber} · {display}
                </p>
              </div>
              <button
                onClick={() => setTimelineOpen(false)}
                className="p-1.5 rounded text-muted-foreground hover:bg-muted"
              >
                <X size={16} />
              </button>
            </header>
            <div className="p-5 overflow-y-auto flex-1">
              <AttendanceTimeline ticketId={ticket.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponentes ─────────────────────────────────────────────────────

function Chip({
  icon, children, className,
}: {
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-[11px] font-medium text-slate-700 dark:text-slate-300',
      className,
    )}>
      {icon}{children}
    </span>
  )
}

function VitalInput({
  label, unit, value, onChange, icon, placeholder, step,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  icon: React.ReactNode
  placeholder?: string
  step?: string
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mb-1">
        {icon}{label}
        <span className="font-normal opacity-60">({unit})</span>
      </label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  )
}
