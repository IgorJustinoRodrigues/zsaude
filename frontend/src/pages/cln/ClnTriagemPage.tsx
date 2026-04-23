// Tela de atendimento de triagem. Coleta queixa, sinais vitais,
// antropometria (peso/altura/IMC + perímetros), gestação quando
// aplicável, e classificação de risco — grava em ``triage_records`` e
// libera o paciente pra fila de atendimento numa transação.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Activity, AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Baby,
  Calculator, Check, ChevronDown, ChevronUp, Clock, Droplet, Gauge, Heart,
  History, Loader2, RotateCcw, Ruler, Send, Shield, Thermometer,
  UserX, Weight, Wind, X,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { PatientPhotoImg } from '../hsp/components/PatientPhotoImg'
import { AttendanceTimeline } from '../rec/components/AttendanceTimeline'
import { ProceduresSection } from './components/ProceduresSection'
import { clnApi, type CampinasComplaint, type ClnQueueItem, type PriorityGroup, type TriageRecordOut, type Ubs } from '../../api/cln'
import { hspApi, type PatientRead } from '../../api/hsp'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { confirmDialog, promptDialog } from '../../store/dialogStore'
import { calcAge, cn, formatCPF, formatDate, formatDateTime, initials } from '../../lib/utils'

/** Nível de risco (1 = emergência, 5 = não urgente) — alinhado com spec SUS. */
type Risk = 1 | 2 | 3 | 4 | 5

const RISK_META: Record<Risk, { label: string; hint: string; bg: string; ring: string }> = {
  1: { label: 'Emergência',    hint: 'Atendimento imediato',   bg: 'bg-red-600',     ring: 'ring-red-500/40' },
  2: { label: 'Muito urgente', hint: 'Em até 10 minutos',      bg: 'bg-orange-500',  ring: 'ring-orange-500/40' },
  3: { label: 'Urgente',       hint: 'Em até 60 minutos',      bg: 'bg-yellow-500',  ring: 'ring-yellow-500/40' },
  4: { label: 'Pouco urgente', hint: 'Em até 120 minutos',     bg: 'bg-emerald-500', ring: 'ring-emerald-500/40' },
  5: { label: 'Não urgente',   hint: 'Em até 240 minutos',     bg: 'bg-sky-500',     ring: 'ring-sky-500/40' },
}
const RISK_LEVELS: Risk[] = [1, 2, 3, 4, 5]

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
  const [priorityGroups, setPriorityGroups] = useState<PriorityGroup[]>([])
  const [priorityGroupId, setPriorityGroupId] = useState<string>('')

  // Antropometria (Fase D).
  const [peso, setPeso] = useState('')
  const [altura, setAltura] = useState('')
  const [pcCefalico, setPcCefalico] = useState('')
  const [pcAbdominal, setPcAbdominal] = useState('')
  const [pcToracico, setPcToracico] = useState('')
  const [pcPanturrilha, setPcPanturrilha] = useState('')
  // Gestação — ``gestanteChoice`` usa string pra mapear null / sim / não.
  const [gestanteChoice, setGestanteChoice] = useState<'' | 'sim' | 'nao'>('')
  const [dum, setDum] = useState('')
  const [semanasGestacao, setSemanasGestacao] = useState('')

  const [triageHistory, setTriageHistory] = useState<TriageRecordOut[]>([])

  // Protocolo Campinas (Fase G).
  const [complaints, setComplaints] = useState<CampinasComplaint[]>([])
  const [complaintCode, setComplaintCode] = useState<string>('')
  const [markedDiscriminators, setMarkedDiscriminators] = useState<Set<string>>(new Set())
  const [overrideReason, setOverrideReason] = useState('')

  // Encaminhamento UBS (Fase H).
  const [ubsList, setUbsList] = useState<Ubs[]>([])
  const [referModalOpen, setReferModalOpen] = useState(false)
  const [referring, setReferring] = useState(false)

  const load = useCallback(async () => {
    if (!ticketId) return
    setLoading(true)
    try {
      const t = await clnApi.getTicket(ticketId)
      setTicket(t)
      if (t.priorityGroupId) setPriorityGroupId(t.priorityGroupId)
      if (t.patientId) {
        const p = await hspApi.get(t.patientId).catch(() => null)
        setPatient(p)
      }
      if (t.triageCount >= 1) {
        const hist = await clnApi.listTriageHistory(ticketId).catch(() => [])
        setTriageHistory(hist)
      } else {
        setTriageHistory([])
      }
    } catch (err) {
      if (err instanceof HttpError) toast.error('Atendimento', err.message)
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    clnApi.listPriorityGroups()
      .then(setPriorityGroups)
      .catch(() => { /* silencioso — grupo é opcional */ })
    clnApi.listCampinasComplaints()
      .then(setComplaints)
      .catch(() => { /* silencioso — protocolo é opcional */ })
    clnApi.listUbs()
      .then(setUbsList)
      .catch(() => { /* silencioso — se não tiver UBS cadastrada, botão não aparece */ })
  }, [])

  // Sugestão calculada a partir do fluxograma + discriminadores marcados.
  // Menor valor vence (1 = mais grave).
  const suggestedRisk = useMemo<Risk | null>(() => {
    if (!complaintCode) return null
    const c = complaints.find(x => x.code === complaintCode)
    if (!c) return null
    let minRisk: number | null = null
    for (const d of c.discriminators) {
      if (markedDiscriminators.has(d.code)) {
        if (minRisk === null || d.risk < minRisk) minRisk = d.risk
      }
    }
    return (minRisk as Risk | null) ?? null
  }, [complaintCode, complaints, markedDiscriminators])

  // Quando a sugestão muda e o triador ainda não escolheu, adota a
  // sugestão como pré-seleção — ele pode mudar depois.
  useEffect(() => {
    if (suggestedRisk && risk === null) setRisk(suggestedRisk)
  }, [suggestedRisk, risk])

  const isOverride = suggestedRisk != null && risk != null && suggestedRisk !== risk

  // IMC = peso / altura²  (peso kg, altura em cm → converte pra m).
  // Arredondamos pra 2 casas — valor exibido na tela é exatamente o que
  // vai ao banco (Numeric(5,2)).
  const imc = useMemo<number | null>(() => {
    const p = Number(peso.replace(',', '.'))
    const a = Number(altura)
    if (!Number.isFinite(p) || p <= 0) return null
    if (!Number.isFinite(a) || a < 30) return null
    const m = a / 100
    return Math.round((p / (m * m)) * 100) / 100
  }, [peso, altura])

  // Gestação só faz sentido pra sexo feminino ou pacientes sem cadastro
  // (anônimo). Esconde se sabemos que é M.
  const showGestationSection = !patient || patient.sex !== 'M'

  async function handleRelease() {
    if (!ticket) return
    if (!risk) {
      toast.warning('Classificação obrigatória', 'Selecione a cor de risco antes de liberar.')
      return
    }
    if (isOverride && !overrideReason.trim()) {
      toast.warning(
        'Motivo do override obrigatório',
        'Você escolheu classificação diferente da sugerida pelo protocolo. Informe o motivo.',
      )
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
      // Converte strings vazias em null e números em number.
      const num = (s: string): number | null => {
        const t = s.trim()
        if (!t) return null
        const n = Number(t)
        return Number.isFinite(n) ? n : null
      }
      await clnApi.triageAndRelease(ticket.id, {
        queixa: queixa.trim(),
        observacoes: obs.trim(),
        paSistolica: num(paSist),
        paDiastolica: num(paDiast),
        fc: num(fc),
        fr: num(fr),
        temperatura: num(temp),
        spo2: num(spo2),
        glicemia: num(glicemia),
        dor,
        peso: num(peso),
        altura: num(altura),
        imc,
        perimetroCefalico: num(pcCefalico),
        perimetroAbdominal: num(pcAbdominal),
        perimetroToracico: num(pcToracico),
        perimetroPanturrilha: num(pcPanturrilha),
        gestante: showGestationSection
          ? (gestanteChoice === 'sim' ? true
            : gestanteChoice === 'nao' ? false
            : null)
          : null,
        dum: showGestationSection && dum ? dum : null,
        semanasGestacao: showGestationSection ? num(semanasGestacao) : null,
        riskClassification: risk,
        riskAutoSuggested: suggestedRisk,
        riskOverrideReason: isOverride ? overrideReason.trim() : null,
        complaintCode: complaintCode || null,
        priorityGroupId: priorityGroupId || null,
      })
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

  async function handleRefer(ubsId: string) {
    if (!ticket) return
    setReferring(true)
    try {
      await clnApi.refer(ticket.id, ubsId)
      toast.success('Encaminhado', `${ticket.ticketNumber} → UBS`)
      // Abre guia em nova aba pro triador imprimir.
      window.open(`/cln/referral/${ticket.id}/print`, '_blank', 'noopener,noreferrer')
      navigate('/cln/triagem')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Encaminhar', err.message)
    } finally {
      setReferring(false)
      setReferModalOpen(false)
    }
  }

  const [evading, setEvading] = useState(false)
  async function handleEvade() {
    if (!ticket) return
    const ok = await confirmDialog({
      title: 'Marcar como evadido?',
      message: `Senha ${ticket.ticketNumber} · ${ticket.patientName} não retornou. Esta ação registra a evasão e fecha o atendimento.`,
      confirmLabel: 'Evadiu-se',
      variant: 'danger',
    })
    if (!ok) return
    setEvading(true)
    try {
      await clnApi.evade(ticket.id)
      toast.success('Evadido', ticket.ticketNumber)
      navigate('/cln/triagem')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Evadiu-se', err.message)
    } finally {
      setEvading(false)
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
        title={triageHistory.length > 0 ? `Retriagem (${triageHistory.length + 1}ª)` : 'Triagem'}
        subtitle={`Senha ${ticket.ticketNumber} · ${display}`}
        back="/cln/triagem"
        actions={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTimelineOpen(true)}
              title="Linha do tempo"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border hover:bg-muted"
            >
              <History size={14} />
            </button>
            <button
              onClick={handleEvade}
              disabled={evading}
              title="Paciente não retornou — marca como evadido"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50"
            >
              {evading ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
            </button>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              title="Cancelar atendimento"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
            >
              {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            </button>
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ─── Sidebar fixa: paciente + classificação + ações ─────────── */}
        <aside className="lg:w-80 xl:w-96 lg:shrink-0 lg:sticky lg:top-4 lg:self-start space-y-3 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {/* Paciente compacto */}
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex gap-3">
              <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center text-lg font-black text-muted-foreground">
                {patient?.currentPhotoId ? (
                  <PatientPhotoImg
                    patientId={patient.id}
                    alt={display}
                    className="w-full h-full object-cover"
                    fallback={<>{initials(display)}</>}
                  />
                ) : initials(display)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate leading-tight">{display}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {patient?.birthDate && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                      <Clock size={9} /> {calcAge(patient.birthDate)}a
                    </span>
                  )}
                  {patient?.cpf && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium tabular-nums">
                      {formatCPF(patient.cpf)}
                    </span>
                  )}
                  {ticket.priority && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-[10px] font-semibold">
                      <Shield size={9} /> {ticket.priorityGroupLabel || 'Prioridade'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Classificação de risco — vertical, compacta */}
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle size={11} /> Classificação
              </h3>
              {suggestedRisk && (
                <span className="text-[10px] font-semibold text-primary">
                  Sugerido: Nível {suggestedRisk}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {RISK_LEVELS.map(k => {
                const m = RISK_META[k]
                const active = risk === k
                const isSuggestion = suggestedRisk === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRisk(k)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-white text-left transition-all',
                      m.bg,
                      active
                        ? `ring-2 ${m.ring} shadow-md`
                        : 'opacity-75 hover:opacity-100',
                    )}
                  >
                    <span className="w-7 h-7 rounded-md bg-white/25 flex items-center justify-center text-base font-black tabular-nums shrink-0">
                      {k}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{m.label}</span>
                      <span className="block text-[10px] opacity-85 leading-tight">{m.hint}</span>
                    </span>
                    {active && <Check size={14} className="shrink-0" />}
                    {isSuggestion && !active && (
                      <span className="text-[9px] font-bold bg-white/30 px-1 py-0.5 rounded shrink-0">
                        SUGER.
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Override — obrigatório se classif. final ≠ sugestão */}
            {isOverride && (
              <div className="mt-3 pt-3 border-t border-border">
                <label className="block text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-1">
                  <AlertTriangle size={11} />
                  Motivo do override <span className="text-muted-foreground font-normal">(obrigatório)</span>
                </label>
                <textarea
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder="Ex.: sinais clínicos não contemplados no fluxograma…"
                  className="w-full px-2 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-none"
                />
              </div>
            )}
          </div>

          {/* Banner UBS encaminhar — visível só quando nível 4 ou 5 */}
          {risk !== null && risk >= 4 && ubsList.length > 0 && (
            <button
              type="button"
              onClick={() => setReferModalOpen(true)}
              className="w-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/50 rounded-xl p-3 flex items-center gap-2.5 text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
                <Send size={14} className="text-amber-700 dark:text-amber-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Encaminhar pra UBS
                </p>
                <p className="text-[10px] text-amber-800/70 dark:text-amber-200/60">
                  Não urgente — melhor na atenção básica
                </p>
              </div>
              <ArrowRight size={14} className="text-amber-700 dark:text-amber-300 shrink-0" />
            </button>
          )}

          {/* Ações primárias */}
          <div className="space-y-2">
            <button
              onClick={handleRelease}
              disabled={releasing || !risk}
              title={!risk ? 'Selecione a classificação de risco antes' : undefined}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-sm font-bold shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {releasing
                ? <><Loader2 size={16} className="animate-spin" /> Liberando…</>
                : <><Check size={16} /> Liberar pra atendimento</>}
            </button>
            <button
              onClick={() => navigate('/cln/triagem')}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:bg-muted text-xs font-medium"
            >
              <ArrowLeft size={13} /> Voltar à fila
            </button>
          </div>
        </aside>

        {/* ─── Conteúdo principal: 2 colunas em md+ ──────────────────── */}
        <main className="flex-1 min-w-0 space-y-4">
          {/* Retriagem — full width no topo */}
          {triageHistory.length > 0 && (
            <PriorTriageCard records={triageHistory} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ── Coluna 1: clínico (protocolo → queixa → vitais) ── */}
            <div className="space-y-4">
              {/* Protocolo Campinas */}
              <Section
                icon={<Activity size={13} />}
                title="Queixa (protocolo)"
                hint="Fluxograma guia a sugestão de classificação."
              >
                <select
                  value={complaintCode}
                  onChange={e => {
                    setComplaintCode(e.target.value)
                    setMarkedDiscriminators(new Set())
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">— sem protocolo, classificação livre —</option>
                  {complaints.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>

                {complaintCode && (() => {
                  const complaint = complaints.find(c => c.code === complaintCode)
                  if (!complaint) return null
                  return (
                    <ul className="mt-3 space-y-1">
                      {complaint.discriminators.map(d => {
                        const marked = markedDiscriminators.has(d.code)
                        const m = RISK_META[d.risk as Risk]
                        return (
                          <li key={d.code}>
                            <button
                              type="button"
                              onClick={() => {
                                setMarkedDiscriminators(prev => {
                                  const next = new Set(prev)
                                  if (next.has(d.code)) next.delete(d.code)
                                  else next.add(d.code)
                                  return next
                                })
                              }}
                              className={cn(
                                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left text-xs transition-colors',
                                marked
                                  ? 'bg-primary/5 border-primary/40'
                                  : 'border-border hover:bg-muted',
                              )}
                            >
                              <span className={cn(
                                'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                marked ? 'bg-primary border-primary' : 'border-border',
                              )}>
                                {marked && <Check size={10} className="text-primary-foreground" />}
                              </span>
                              <span className="flex-1">{d.text}</span>
                              <span className={cn(
                                'px-1 py-0.5 rounded text-white text-[9px] font-bold tabular-nums shrink-0',
                                m?.bg ?? 'bg-slate-500',
                              )}>
                                N{d.risk}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )
                })()}
              </Section>

              {/* Queixa relatada */}
              <Section
                icon={<AlertCircle size={13} />}
                title="Queixa relatada"
                hint="O que o paciente narra."
              >
                <textarea
                  value={queixa}
                  onChange={e => setQueixa(e.target.value.slice(0, 1000))}
                  rows={2}
                  placeholder="Dor de cabeça há 2 dias, febre baixa…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </Section>

              {/* Sinais vitais */}
              <Section
                icon={<Heart size={13} />}
                title="Sinais vitais"
                hint="Deixe em branco o que não aferir."
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <VitalInput label="PA Sist." unit="mmHg" value={paSist} onChange={setPaSist}
                    icon={<Gauge size={11} />} placeholder="120" />
                  <VitalInput label="PA Diast." unit="mmHg" value={paDiast} onChange={setPaDiast}
                    icon={<Gauge size={11} />} placeholder="80" />
                  <VitalInput label="FC" unit="bpm" value={fc} onChange={setFc}
                    icon={<Heart size={11} />} placeholder="72" />
                  <VitalInput label="FR" unit="irpm" value={fr} onChange={setFr}
                    icon={<Wind size={11} />} placeholder="16" />
                  <VitalInput label="Temp" unit="°C" value={temp} onChange={setTemp}
                    icon={<Thermometer size={11} />} placeholder="36.5" step="0.1" />
                  <VitalInput label="SpO2" unit="%" value={spo2} onChange={setSpo2}
                    icon={<Wind size={11} />} placeholder="98" />
                  <VitalInput label="Glicemia" unit="mg/dL" value={glicemia} onChange={setGlicemia}
                    icon={<Droplet size={11} />} placeholder="90" />
                </div>

                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold">Escala de dor</label>
                    <span className="text-xs tabular-nums font-bold">{dor}/10</span>
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
                </div>
              </Section>
            </div>

            {/* ── Coluna 2: complementares ── */}
            <div className="space-y-4">
              {/* Grupo prioritário */}
              <Section icon={<Shield size={13} />} title="Grupo prioritário">
                <select
                  value={priorityGroupId}
                  onChange={e => setPriorityGroupId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Nenhum</option>
                  {priorityGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </Section>

              {/* Medidas antropométricas */}
              <Section
                icon={<Ruler size={13} />}
                title="Medidas"
                hint="IMC calcula automaticamente."
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <VitalInput label="Peso" unit="kg" value={peso} onChange={setPeso}
                    icon={<Weight size={11} />} placeholder="70" step="0.1" />
                  <VitalInput label="Altura" unit="cm" value={altura} onChange={setAltura}
                    icon={<Ruler size={11} />} placeholder="170" />
                  <div>
                    <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mb-1">
                      <Calculator size={11} />IMC
                    </label>
                    <div
                      className="w-full px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm tabular-nums text-muted-foreground"
                      title="Calculado automaticamente."
                    >
                      {imc !== null ? imc.toFixed(2) : '—'}
                    </div>
                  </div>
                  <VitalInput label="PC cef." unit="cm" value={pcCefalico} onChange={setPcCefalico}
                    icon={<Baby size={11} />} placeholder="34.5" step="0.1" />
                  <VitalInput label="PC abd." unit="cm" value={pcAbdominal} onChange={setPcAbdominal}
                    icon={<Ruler size={11} />} placeholder="90" step="0.1" />
                  <VitalInput label="PC torác." unit="cm" value={pcToracico} onChange={setPcToracico}
                    icon={<Ruler size={11} />} placeholder="95" step="0.1" />
                  <VitalInput label="PC pantur." unit="cm" value={pcPanturrilha} onChange={setPcPanturrilha}
                    icon={<Ruler size={11} />} placeholder="34" step="0.1" />
                </div>
              </Section>

              {/* Gestação — condicional por sexo */}
              {showGestationSection && (
                <Section icon={<Baby size={13} />} title="Gestação">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {([
                      ['',    'Não perguntado'],
                      ['sim', 'Gestante'],
                      ['nao', 'Não gestante'],
                    ] as const).map(([val, label]) => (
                      <button
                        key={val || 'none'}
                        type="button"
                        onClick={() => setGestanteChoice(val)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors',
                          gestanteChoice === val
                            ? 'bg-pink-600 text-white border-pink-600'
                            : 'border-border hover:bg-muted',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {gestanteChoice === 'sim' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground">DUM</label>
                        <input
                          type="date"
                          value={dum}
                          onChange={e => setDum(e.target.value)}
                          max={new Date().toISOString().slice(0, 10)}
                          className="w-full mt-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground">Semanas</label>
                        <input
                          type="number"
                          min={0}
                          max={45}
                          value={semanasGestacao}
                          onChange={e => setSemanasGestacao(e.target.value)}
                          placeholder={dum ? String(weeksSinceISO(dum) ?? '') : '0-45'}
                          className="w-full mt-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* Procedimentos SIGTAP */}
              <ProceduresSection ticketId={ticket.id} />

              {/* Observações */}
              <Section title="Observações" hint="Alergias, medicações, antecedentes.">
                <textarea
                  value={obs}
                  onChange={e => setObs(e.target.value.slice(0, 2000))}
                  rows={2}
                  placeholder="Paciente hipertenso, toma losartana…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </Section>
            </div>
          </div>
        </main>
      </div>

      {/* Modal encaminhamento UBS */}
      {referModalOpen && (
        <div onClick={() => !referring && setReferModalOpen(false)} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div
            onClick={e => e.stopPropagation()}
            className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-lg overflow-hidden"
          >
            <header className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold">Encaminhar pra UBS</h3>
              <button
                onClick={() => setReferModalOpen(false)}
                disabled={referring}
                className="p-1.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </header>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Selecione a UBS de referência. Ao confirmar, o atendimento
                é encerrado e a guia de encaminhamento abre em nova aba
                pra impressão.
              </p>
              <ul className="max-h-80 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {ubsList.map(u => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={referring}
                      onClick={() => handleRefer(u.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted flex items-center gap-3 disabled:opacity-50"
                    >
                      <Send size={14} className="text-amber-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        {u.cnes && (
                          <p className="text-[11px] text-muted-foreground">CNES {u.cnes}</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {referring && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  Encaminhando…
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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

/** Wrapper de seção compacta usada no layout denso da triagem. */
function Section({
  icon, title, hint, children,
}: {
  icon?: React.ReactNode
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
        {icon}{title}
        {hint && (
          <span className="font-normal normal-case tracking-normal opacity-70 text-[10px] ml-auto">
            {hint}
          </span>
        )}
      </h3>
      {children}
    </div>
  )
}

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

// Cores idênticas ao seletor principal — mantém leitura consistente.
const RISK_BG: Record<number, string> = {
  1: 'bg-red-600', 2: 'bg-orange-500', 3: 'bg-yellow-500',
  4: 'bg-emerald-500', 5: 'bg-sky-500',
}
const RISK_LABEL: Record<number, string> = {
  1: 'Emergência', 2: 'Muito urgente', 3: 'Urgente',
  4: 'Pouco urgente', 5: 'Não urgente',
}

/** Card das triagens anteriores — a mais recente destacada, demais
 *  colapsadas pra não poluir. Só renderiza quando há histórico. */
function PriorTriageCard({ records }: { records: TriageRecordOut[] }) {
  const [expanded, setExpanded] = useState(false)
  const [latest, ...rest] = records

  const pa =
    latest.paSistolica != null && latest.paDiastolica != null
      ? `${latest.paSistolica}/${latest.paDiastolica}` : null

  return (
    <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <RotateCcw size={14} className="text-violet-600 dark:text-violet-400" />
        <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          Triagem anterior
          <span className="font-normal text-[11px] ml-1 opacity-70">
            ({records.length} registro{records.length === 1 ? '' : 's'})
          </span>
        </h3>
      </div>

      <PriorTriageRow r={latest} pa={pa} highlighted />

      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300 hover:underline"
          >
            {expanded
              ? <><ChevronUp size={12} /> Ocultar {rest.length} anterior{rest.length === 1 ? '' : 'es'}</>
              : <><ChevronDown size={12} /> Ver {rest.length} anterior{rest.length === 1 ? '' : 'es'}</>}
          </button>
          {expanded && (
            <ul className="mt-2 space-y-2">
              {rest.map(r => (
                <li key={r.id}>
                  <PriorTriageRow r={r} pa={
                    r.paSistolica != null && r.paDiastolica != null
                      ? `${r.paSistolica}/${r.paDiastolica}` : null
                  } />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function PriorTriageRow({
  r, pa, highlighted = false,
}: { r: TriageRecordOut; pa: string | null; highlighted?: boolean }) {
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-2 text-xs',
      highlighted ? '' : 'opacity-80',
    )}>
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-semibold',
        RISK_BG[r.riskClassification] || 'bg-slate-500',
      )}>
        Nível {r.riskClassification} · {RISK_LABEL[r.riskClassification] ?? '—'}
      </span>
      {pa && <Chip icon={<Gauge size={11} />}>PA {pa}</Chip>}
      {r.fc != null && <Chip icon={<Heart size={11} />}>FC {r.fc}</Chip>}
      {r.temperatura != null && <Chip icon={<Thermometer size={11} />}>{r.temperatura}°C</Chip>}
      {r.spo2 != null && <Chip icon={<Wind size={11} />}>SpO₂ {r.spo2}%</Chip>}
      {r.dor > 0 && <Chip>Dor {r.dor}/10</Chip>}
      <span className="text-[11px] text-violet-800/70 dark:text-violet-200/60 ml-auto">
        {formatDateTime(r.createdAt)} · {r.triagedByUserName.trim() || '—'}
      </span>
    </div>
  )
}

/** Semanas completas entre ISO date (YYYY-MM-DD) e hoje. Null se inválida
 *  ou futura — retorno serve como placeholder do input de semanas. */
function weeksSinceISO(iso: string): number | null {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const diff = Date.now() - d.getTime()
  if (diff < 0) return null
  const weeks = Math.floor(diff / (1000 * 60 * 60 * 24 * 7))
  return weeks > 45 ? null : weeks
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
