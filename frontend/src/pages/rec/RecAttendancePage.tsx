// Tela de atendimento da recepção. Wizard em 3 etapas:
//   1. Identidade — recepção confirma que o paciente é quem o cadastro
//      diz (foto, nome, nascimento, CPF). "Confirmar identidade" avança.
//   2. Dados rápidos — edição in-place dos campos que mais mudam no balcão
//      (telefone, celular, endereço). Não obriga — "Continuar sem editar".
//   3. Encaminhamento — seleção do setor. O dropdown é filtrado pelo
//      ``forwardSectorNames`` do rec_config do escopo, com o
//      ``afterAttendanceSector`` pré-selecionado. Botão primário encaminha
//      e volta pra fila.
//
// Se precisar editar dados complexos (documentos, condições, etc.), tem
// o botão "Editar ficha completa" na etapa 1 que abre ``/rec/atendimento/
// :id/ficha`` com o HspPatientFormPage.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Cake, Calendar, Camera, Check,
  CheckCircle2, Clock, Edit3, Hash, Loader2, MapPin, PhoneCall, Plus,
  ShieldAlert, Star, Trash2, User, X,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { PatientPhotoImg } from '../hsp/components/PatientPhotoImg'
import { FaceRecognitionModal } from '../hsp/components/FaceRecognitionModal'
import { HspPatientFormPage } from '../hsp/HspPatientFormPage'
import { AttendanceTimeline } from './components/AttendanceTimeline'
import { FormField } from '../../components/ui/FormField'
import { MaskedInput } from '../../components/ui/MaskedInput'
import {
  hspApi,
  type PatientAddressInput,
  type PatientAddressOut,
  type PatientRead,
} from '../../api/hsp'
import { recApi, type AttendanceItem, type PatientVisitSummary } from '../../api/rec'
import { recConfigApi } from '../../api/recConfig'
import { sectorsApi, type Sector } from '../../api/sectors'
import { dataUrlToBlob } from '../../api/face'
import { fetchCep } from '../../api/viacep'
import { HttpError } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/toastStore'
import { confirmDialog } from '../../store/dialogStore'
import { cepMask } from '../../lib/masks'
import { birthdayHint, formatCPF, formatDate, calcAge, initials, cn } from '../../lib/utils'

type Step = 1 | 2 | 3

const ACTIVE_STATUSES = new Set([
  'reception_waiting', 'reception_called', 'reception_attending',
  'triagem_waiting', 'sector_waiting',
])

export function RecAttendancePage() {
  const { id: patientId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const facilityId = useAuthStore(s => s.context?.facility.id)

  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>(1)
  const [patient, setPatient] = useState<PatientRead | null>(null)
  const [ticket, setTicket] = useState<AttendanceItem | null>(null)
  const [sectors, setSectors] = useState<Sector[]>([])
  const [allowedSectorNames, setAllowedSectorNames] = useState<string[] | null>(null)
  const [suggestedSector, setSuggestedSector] = useState<string | null>(null)

  // Upload de foto quando paciente não tem
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Endereços secundários (trabalho, casa da mãe, etc.)
  const [extraAddresses, setExtraAddresses] = useState<PatientAddressOut[]>([])
  const [addrEditor, setAddrEditor] = useState<PatientAddressOut | 'new' | null>(null)
  const [addrBusy, setAddrBusy] = useState(false)

  // Modal de cancelamento (com check de confirmação explícita)
  const [cancelOpen, setCancelOpen] = useState(false)

  // Resumo de histórico na unidade (total de visitas + última).
  const [visitSummary, setVisitSummary] = useState<PatientVisitSummary | null>(null)
  // Token de refresh da timeline — bump após chamadas/encaminhamento.
  const [timelineTick, setTimelineTick] = useState(0)
  const refreshTimeline = useCallback(() => setTimelineTick(t => t + 1), [])

  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [forwarding, setForwarding] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [calling, setCalling] = useState(false)

  // ── Bootstrap ──────────────────────────────────────────────────
  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      hspApi.get(patientId),
      recApi.listTickets().catch(() => [] as AttendanceItem[]),
      sectorsApi.effective().catch(() => ({ sectors: [] as Sector[] })),
      facilityId
        ? recConfigApi.effective({ facilityId }).catch(() => null)
        : Promise.resolve(null),
      hspApi.listAddresses(patientId).catch(() => [] as PatientAddressOut[]),
      recApi.patientVisitSummary(patientId).catch(() => null),
    ]).then(([p, tickets, sectorsRes, cfg, addresses, visits]) => {
      if (cancelled) return
      setPatient(p)
      const active = tickets.find(t =>
        t.patientId === patientId && ACTIVE_STATUSES.has(t.status),
      ) ?? null
      setTicket(active)
      setExtraAddresses(addresses)
      setVisitSummary(visits)
      setSectors(sectorsRes.sectors)
      if (cfg) {
        setSuggestedSector(cfg.recepcao.afterAttendanceSector)
        setAllowedSectorNames(cfg.recepcao.forwardSectorNames)
        setSelectedSector(cfg.recepcao.afterAttendanceSector)
      }
    }).catch(err => {
      if (err instanceof HttpError) toast.error('Atendimento', err.message)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [patientId, facilityId])

  // ── Setores visíveis (allowlist + sugerido sempre aparece) ────
  const visibleSectors = useMemo(() => {
    const allowed = allowedSectorNames === null
      ? sectors
      : sectors.filter(s => allowedSectorNames.includes(s.name))
    // Garante que o sugerido nunca suma silenciosamente por config mal-feita.
    if (suggestedSector && !allowed.some(s => s.name === suggestedSector)) {
      const sugg = sectors.find(s => s.name === suggestedSector)
      if (sugg) return [...allowed, sugg]
    }
    return allowed
  }, [sectors, allowedSectorNames, suggestedSector])

  const effectiveSector = selectedSector
    ?? (suggestedSector && visibleSectors.some(s => s.name === suggestedSector)
      ? suggestedSector
      : visibleSectors[0]?.name ?? null)

  // ── Endereços extras ──────────────────────────────────────────
  const saveExtraAddress = useCallback(async (payload: PatientAddressInput) => {
    if (!patientId) return
    setAddrBusy(true)
    try {
      if (addrEditor === 'new') {
        const created = await hspApi.createAddress(patientId, payload)
        setExtraAddresses(prev => [...prev, created])
        toast.success('Endereço adicionado')
      } else if (addrEditor) {
        const updated = await hspApi.updateAddress(patientId, addrEditor.id, payload)
        setExtraAddresses(prev => prev.map(a => a.id === updated.id ? updated : a))
        toast.success('Endereço atualizado')
      }
      setAddrEditor(null)
    } catch (err) {
      if (err instanceof HttpError) toast.error('Endereço', err.message)
    } finally {
      setAddrBusy(false)
    }
  }, [patientId, addrEditor])

  const deleteExtraAddress = useCallback(async (addr: PatientAddressOut) => {
    if (!patientId) return
    const ok = await confirmDialog({
      title: 'Remover endereço?',
      message: `"${addr.label}" será apagado.`,
      confirmLabel: 'Remover',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await hspApi.deleteAddress(patientId, addr.id)
      setExtraAddresses(prev => prev.filter(a => a.id !== addr.id))
      toast.success('Endereço removido')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Endereço', err.message)
    }
  }, [patientId])

  // ── Upload de foto (quando paciente não tem) ──────────────────
  const handlePhotoCaptured = useCallback(async (dataUrl: string) => {
    if (!patient) return
    setUploadingPhoto(true)
    try {
      const blob = dataUrlToBlob(dataUrl)
      const updated = await hspApi.uploadPhoto(patient.id, blob)
      setPatient(updated)
      refreshTimeline()
      toast.success('Foto adicionada ao cadastro')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Upload', err.message)
      else toast.error('Upload', 'Falha ao enviar foto.')
    } finally {
      setUploadingPhoto(false)
      setUploadModalOpen(false)
    }
  }, [patient, refreshTimeline])

  async function handleForward() {
    if (!ticket || !effectiveSector) return
    setForwarding(true)
    try {
      await recApi.forwardTicket(ticket.id, effectiveSector)
      toast.success('Encaminhado', `${ticket.ticketNumber} → ${effectiveSector}`)
      navigate('/rec/atendimento')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Encaminhar', err.message)
    } finally {
      setForwarding(false)
    }
  }

  async function handleRecall() {
    if (!ticket) return
    const ok = await confirmDialog({
      title: 'Chamar no painel?',
      message: `Senha ${ticket.ticketNumber} · ${ticket.patientName} será anunciada agora em todos os painéis da unidade.`,
      confirmLabel: 'Chamar',
    })
    if (!ok) return
    setCalling(true)
    try {
      await recApi.publishCall({
        ticket: ticket.ticketNumber,
        patientName: ticket.patientName,
        priority: ticket.priority,
        attendanceId: ticket.id,
      })
      toast.success('Chamado no painel', ticket.ticketNumber)
      refreshTimeline()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Chamar', err.message)
    } finally {
      window.setTimeout(() => setCalling(false), 5000)
    }
  }

  async function handleCancelConfirmed(reason: string) {
    if (!ticket) return
    setCancelling(true)
    try {
      await recApi.cancelTicket(ticket.id, reason)
      toast.success('Atendimento cancelado', `Senha ${ticket.ticketNumber}`)
      navigate('/rec/atendimento')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Cancelar', err.message)
    } finally {
      setCancelling(false)
      setCancelOpen(false)
    }
  }

  async function handleBack() {
    // Dirty check agora vive dentro do HspPatientFormPage (embedado) —
    // aqui só avaliamos se há ticket ativo pra pular o confirm.
    if (ticket) {
      const ok = await confirmDialog({
        title: 'Voltar à fila?',
        message: 'O atendimento continua ativo. Você pode retomá-lo a qualquer momento.',
        confirmLabel: 'Voltar à fila',
      })
      if (!ok) return
    }
    navigate('/rec/atendimento')
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!patient) {
    return (
      <div>
        <PageHeader title="Atendimento" back="/rec/atendimento" />
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Paciente não encontrado.
        </div>
      </div>
    )
  }

  const display = patient.socialName || patient.name

  return (
    <div>
      <PageHeader
        title="Atendimento"
        subtitle={ticket
          ? `Senha ${ticket.ticketNumber} · ${display}`
          : display}
        back="/rec/atendimento"
        actions={ticket && (
          <button
            onClick={() => setCancelOpen(true)}
            disabled={cancelling}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 transition-colors"
            title="Cancela o atendimento — requer motivo"
          >
            {cancelling
              ? <Loader2 size={13} className="animate-spin" />
              : <X size={13} />}
            Cancelar atendimento
          </button>
        )}
      />

      {/* Alerta: paciente sem senha ativa (atendente navegou direto pela URL) */}
      {!ticket && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          <ShieldAlert size={16} />
          Este paciente não tem atendimento ativo. Para encaminhar, emita uma
          senha primeiro.
        </div>
      )}

      {/* Stepper */}
      <Stepper
        current={step}
        labels={['Identidade', 'Dados cadastrais', 'Encaminhamento']}
        onJump={s => setStep(s)}
      />

      {step === 1 && (
        <StepIdentity
          patient={patient}
          ticket={ticket}
          calling={calling}
          uploadingPhoto={uploadingPhoto}
          visitSummary={visitSummary}
          timelineTick={timelineTick}
          onRecall={handleRecall}
          onRequestPhotoUpload={() => setUploadModalOpen(true)}
          onEditFull={() => navigate(`/rec/atendimento/${patient.id}/ficha`)}
          onFillData={() => setStep(2)}
          onNext={() => setStep(2)}
          onBack={handleBack}
        />
      )}

      {step === 2 && (
        <StepRegistrationData
          patientId={patient.id}
          extraAddresses={extraAddresses}
          onAddAddress={() => setAddrEditor('new')}
          onEditAddress={a => setAddrEditor(a)}
          onDeleteAddress={deleteExtraAddress}
          onAdvance={() => { refreshTimeline(); setStep(3) }}
        />
      )}

      {/* Modal de edição de endereço secundário */}
      {addrEditor && (
        <ExtraAddressModal
          initial={addrEditor === 'new' ? null : addrEditor}
          saving={addrBusy}
          onCancel={() => setAddrEditor(null)}
          onSubmit={saveExtraAddress}
        />
      )}

      {/* Modal de captura pra upload de foto */}
      {uploadModalOpen && (
        <FaceRecognitionModal
          mode="enroll"
          onClose={() => setUploadModalOpen(false)}
          onCapture={handlePhotoCaptured}
        />
      )}

      {/* Modal de cancelamento — com motivo + confirmação explícita */}
      {cancelOpen && ticket && (
        <CancelAttendanceModal
          ticket={ticket}
          busy={cancelling}
          onCancel={() => setCancelOpen(false)}
          onConfirm={handleCancelConfirmed}
        />
      )}

      {step === 3 && (
        <StepForward
          sectors={visibleSectors}
          selected={effectiveSector}
          suggested={suggestedSector}
          onSelect={setSelectedSector}
          ticket={ticket}
          forwarding={forwarding}
          onForward={handleForward}
          onPrev={() => setStep(2)}
        />
      )}
    </div>
  )
}

// ─── Stepper ─────────────────────────────────────────────────────────────

function Stepper({
  current, labels, onJump,
}: {
  current: Step
  labels: [string, string, string]
  onJump: (s: Step) => void
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4 mb-6">
      {labels.map((label, i) => {
        const n = (i + 1) as Step
        const done = current > n
        const active = current === n
        return (
          <li key={n} className="flex items-center flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onJump(n)}
              disabled={!done && !active}
              className={cn(
                'flex items-center gap-2 text-sm font-medium transition-colors min-w-0',
                active && 'text-foreground',
                done && 'text-emerald-700 dark:text-emerald-300 hover:underline',
                !active && !done && 'text-muted-foreground cursor-default',
              )}
            >
              <span className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-sm font-bold',
                active && 'bg-primary text-primary-foreground shadow-md',
                done && 'bg-emerald-500 text-white',
                !active && !done && 'bg-muted text-muted-foreground',
              )}>
                {done ? <Check size={16} /> : n}
              </span>
              <span className="truncate">{label}</span>
            </button>
            {i < labels.length - 1 && (
              <span className={cn(
                'flex-1 h-px mx-2 sm:mx-3',
                done ? 'bg-emerald-500' : 'bg-border',
              )} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ─── Etapa 1: Identidade ─────────────────────────────────────────────────

function StepIdentity({
  patient, ticket, calling, uploadingPhoto, visitSummary, timelineTick,
  onRecall, onRequestPhotoUpload, onEditFull, onFillData, onNext, onBack,
}: {
  patient: PatientRead
  ticket: AttendanceItem | null
  calling: boolean
  uploadingPhoto: boolean
  visitSummary: PatientVisitSummary | null
  timelineTick: number
  onRecall: () => void
  onRequestPhotoUpload: () => void
  onEditFull: () => void
  onFillData: () => void
  onNext: () => void
  onBack: () => void
}) {
  const display = patient.socialName || patient.name
  const hasPhoto = !!patient.currentPhotoId

  // Aniversário (hoje/breve)
  const birthday = patient.birthDate ? birthdayHint(patient.birthDate) : null

  // Última visita — "primeira vez" quando não há.
  const lastVisit = visitSummary?.lastVisitAt
    ? formatRelativePast(visitSummary.lastVisitAt)
    : null

  // Campos que a recepção deve conferir/atualizar sempre. Agrupa por
  // seção pra exibir organizado no banner. O último campo booleano
  // ``inQuickForm`` indica se "Atualizar agora" resolve (step 2) ou se
  // precisa abrir a ficha completa.
  const missingGroups = computeMissingGroups(patient)
  const allMissingInQuick = missingGroups.length > 0
    && missingGroups.every(g => g.inQuickForm)
  return (
    <section className="space-y-4">
      {/* Card de identidade */}
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-5">
          {hasPhoto ? (
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl bg-muted overflow-hidden shrink-0 flex items-center justify-center text-3xl font-black text-muted-foreground mx-auto sm:mx-0">
              <PatientPhotoImg
                patientId={patient.id}
                alt={display}
                className="w-full h-full object-cover"
                fallback={<>{initials(display)}</>}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onRequestPhotoUpload}
              disabled={uploadingPhoto}
              className="group w-32 h-32 sm:w-40 sm:h-40 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 hover:border-sky-400 hover:bg-sky-50/60 dark:hover:bg-sky-950/30 transition-all shrink-0 flex flex-col items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 mx-auto sm:mx-0 disabled:opacity-50 disabled:cursor-wait"
              title="Tirar uma foto do paciente"
            >
              {uploadingPhoto ? (
                <>
                  <Loader2 size={28} className="animate-spin" />
                  <span className="text-[11px] font-medium">Enviando…</span>
                </>
              ) : (
                <>
                  <span className="flex items-center justify-center w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 group-hover:bg-sky-100 dark:group-hover:bg-sky-950 transition-colors">
                    <Camera size={22} />
                  </span>
                  <span className="text-[11px] font-semibold text-center leading-tight px-2">
                    Adicionar<br />foto
                  </span>
                </>
              )}
            </button>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <p className="text-2xl sm:text-3xl font-bold leading-tight truncate">
                {display}
              </p>
              {patient.socialName && patient.name !== patient.socialName && (
                <p className="text-sm text-muted-foreground">
                  Nome civil: {patient.name}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {patient.birthDate && (
                <Chip icon={<Clock size={12} />}>
                  {formatDate(patient.birthDate)} · {calcAge(patient.birthDate)} anos
                </Chip>
              )}
              {patient.cpf && <Chip icon={<User size={12} />}>CPF {formatCPF(patient.cpf)}</Chip>}
              {patient.cns && <Chip>CNS {patient.cns}</Chip>}
              {patient.sex && <Chip>{patient.sex === 'M' ? 'Masculino' : patient.sex === 'F' ? 'Feminino' : patient.sex}</Chip>}
            </div>
            {patient.identityReviewNeeded && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                <ShieldAlert size={14} />
                <span className="truncate">
                  Identidade marcada pra revisão
                  {patient.identityReviewReason && ` — ${patient.identityReviewReason}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {ticket && (
          <div className="mt-5 pt-5 border-t border-border flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className={cn(
                'text-3xl font-black tabular-nums',
                ticket.priority ? 'text-red-600' : 'text-teal-700',
              )}>
                {ticket.ticketNumber}
              </span>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {humanTicketStatus(ticket.status)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <Clock size={11} className="inline mr-1" />
                  <WaitLabel sinceIso={ticket.arrivedAt} />
                </p>
              </div>
              {ticket.priority && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-[10px] font-bold uppercase tracking-wider">
                  <Star size={9} /> Prioridade
                </span>
              )}
            </div>
            <button
              onClick={onRecall}
              disabled={calling}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50"
              title="Anuncia de novo no painel"
            >
              <PhoneCall size={13} />
              {calling ? 'Aguarde…' : 'Chamar no painel'}
            </button>
          </div>
        )}
      </div>

      {/* Informações adicionais — contexto pra atendente */}
      {(birthday || ticket || visitSummary) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {birthday && (
            <InfoCard
              icon={<Cake size={18} />}
              tone={birthday.includes('hoje') ? 'celebrate' : 'info'}
              label="Aniversário"
              value={capitalizeFirst(birthday)}
            />
          )}
          {ticket && (
            <InfoCard
              icon={<Clock size={18} />}
              tone="neutral"
              label="Check-in nesta visita"
              value={<WaitLabel sinceIso={ticket.arrivedAt} />}
              hint={ticket.docType === 'manual' ? 'Registro manual' : 'Via totem/balcão'}
            />
          )}
          {visitSummary && (
            <InfoCard
              icon={<Hash size={18} />}
              tone="neutral"
              label="Visitas nesta unidade"
              value={`${visitSummary.totalVisits}`}
              hint={visitSummary.totalVisits === 0 ? 'Primeira vez'
                : visitSummary.totalVisits === 1 ? 'Só esta' : 'Paciente recorrente'}
            />
          )}
          {visitSummary?.lastVisitAt && (
            <InfoCard
              icon={<Calendar size={18} />}
              tone="neutral"
              label="Última visita"
              value={lastVisit ?? formatDate(visitSummary.lastVisitAt.slice(0, 10))}
              hint={formatDate(visitSummary.lastVisitAt.slice(0, 10))}
            />
          )}
        </div>
      )}

      {/* Alerta de dados incompletos — recepção confirma ou preenche */}
      {missingGroups.length > 0 && (
        <div className="p-4 rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Dados do cadastro precisam de confirmação
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                Sempre confirme com o paciente — dados atualizados melhoram o
                cuidado e as buscas futuras.
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 mb-3 pl-12">
            {missingGroups.map(g => (
              <li key={g.section} className="text-xs text-amber-900 dark:text-amber-200">
                <span className="font-semibold">{g.section}:</span>{' '}
                <span className="text-amber-800/80 dark:text-amber-200/80">
                  {g.fields.join(', ')}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pl-12">
            {allMissingInQuick ? (
              <button
                onClick={onFillData}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm shadow-amber-500/30"
              >
                Atualizar agora <ArrowRight size={13} />
              </button>
            ) : (
              <>
                <button
                  onClick={onEditFull}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm shadow-amber-500/30"
                >
                  <Edit3 size={13} /> Abrir ficha completa
                </button>
                <button
                  onClick={onFillData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs font-semibold"
                >
                  Atualizar só contato/endereço <ArrowRight size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Timeline — histórico granular do atendimento (chegada, chamadas,
          rechamadas, encaminhamentos, cancelamento). */}
      {ticket && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold">Linha do tempo</h3>
          </div>
          <AttendanceTimeline ticketId={ticket.id} refreshToken={timelineTick} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <button
          onClick={onEditFull}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-muted text-sm font-medium"
        >
          <Edit3 size={14} /> Editar ficha completa
        </button>
        <div className="flex-1" />
        <button
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-muted"
        >
          <ArrowLeft size={14} /> Voltar à fila
        </button>
        <button
          onClick={onNext}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold"
        >
          <CheckCircle2 size={14} /> Confirmar identidade
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  )
}

// ─── Etapa 2: Dados cadastrais (ficha completa) ──────────────────────────

function StepRegistrationData({
  patientId, extraAddresses, onAddAddress, onEditAddress, onDeleteAddress,
  onAdvance,
}: {
  patientId: string
  extraAddresses: PatientAddressOut[]
  onAddAddress: () => void
  onEditAddress: (a: PatientAddressOut) => void
  onDeleteAddress: (a: PatientAddressOut) => void
  onAdvance: () => void
}) {
  // "Outros endereços" aparece só quando a aba ``Endereço`` está ativa
  // (via slot) — evita poluição visual nas outras abas.
  const extraAddressesCard = (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MapPin size={14} /> Outros endereços
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Trabalho, casa da mãe, sítio — endereços secundários com
            descrição livre.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddAddress}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-semibold shrink-0"
        >
          <Plus size={13} /> Adicionar
        </button>
      </div>
      {extraAddresses.length > 0 && (
        <ul className="space-y-2 mt-4">
          {extraAddresses.map(a => (
            <ExtraAddressRow
              key={a.id}
              address={a}
              onEdit={() => onEditAddress(a)}
              onDelete={() => onDeleteAddress(a)}
            />
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Dados cadastrais</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Revise, confirme e atualize os dados do paciente. Clique em
            <strong className="text-foreground"> Salvar e avançar </strong>
            quando terminar.
          </p>
        </div>
      </header>

      <HspPatientFormPage
        embedded
        patientId={patientId}
        onSaved={() => onAdvance()}
        slotAfterTab={{ 'Endereço': extraAddressesCard }}
      />
    </div>
  )
}

// ─── Etapa 3: Encaminhamento ─────────────────────────────────────────────

function StepForward({
  sectors, selected, suggested, onSelect, ticket,
  forwarding, onForward, onPrev,
}: {
  sectors: Sector[]
  selected: string | null
  suggested: string | null
  onSelect: (name: string) => void
  ticket: AttendanceItem | null
  forwarding: boolean
  onForward: () => void
  onPrev: () => void
}) {
  return (
    <section className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
        <h3 className="text-sm font-semibold mb-1">Encaminhar para o setor</h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          {suggested
            ? <>Sugestão configurada pelo admin: <strong>{suggested}</strong>.</>
            : 'Selecione o setor de destino.'}
        </p>
        {sectors.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
            <ShieldAlert size={16} />
            Nenhum setor disponível — peça pro admin liberar pelo menos um
            setor no módulo de recepção.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sectors.map(s => {
              const isSelected = selected === s.name
              const isSuggested = suggested === s.name
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.name)}
                  className={cn(
                    'px-4 py-3 rounded-lg border text-left transition-all relative',
                    isSelected
                      ? 'border-2 border-primary bg-primary/10 ring-2 ring-primary/30'
                      : 'border-border hover:border-slate-300 dark:hover:border-slate-600',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{s.name}</span>
                    {isSuggested && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Sugerido
                      </span>
                    )}
                  </div>
                  {s.abbreviation && (
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      {s.abbreviation}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <button
          onClick={onPrev}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-muted text-sm font-medium"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="flex-1" />
        <button
          onClick={onForward}
          disabled={forwarding || !selected || !ticket}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-base font-bold shadow-lg shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {forwarding
            ? <><Loader2 size={18} className="animate-spin" /> Encaminhando…</>
            : <><CheckCircle2 size={18} /> Encaminhar para {selected ?? '…'}</>}
        </button>
      </div>
    </section>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function CancelAttendanceModal({
  ticket, busy, onCancel, onConfirm,
}: {
  ticket: AttendanceItem
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const reasonValid = reason.trim().length >= 3
  const canSubmit = reasonValid && confirmed && !busy

  const QUICK_REASONS = [
    'Paciente desistiu',
    'Paciente não compareceu',
    'Identidade incorreta',
    'Duplicidade',
    'Unidade errada',
  ]

  return (
    <div onClick={onCancel} className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease-out]">
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-md overflow-hidden animate-[pop_0.2s_cubic-bezier(0.18,1.3,0.6,1)]"
      >
        <header className="px-5 py-4 border-b border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
              <X size={18} className="text-white" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-rose-700 dark:text-rose-300">
                Cancelar atendimento
              </h3>
              <p className="text-xs text-rose-800/80 dark:text-rose-200/80 mt-0.5 truncate">
                Senha <strong>{ticket.ticketNumber}</strong> · {ticket.patientName}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="p-1.5 rounded text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Motivo do cancelamento
              <span className="text-rose-500 ml-0.5">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 500))}
              placeholder="Descreva o motivo — mín. 3 caracteres"
              rows={3}
              maxLength={500}
              autoFocus
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-rose-500/40 resize-none"
            />
            <div className="flex items-center justify-between mt-1">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setReason(q)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                {reason.length}/500
              </span>
            </div>
          </div>

          <label className={cn(
            'flex items-start gap-3 cursor-pointer select-none p-3 rounded-lg border-2 transition-colors',
            confirmed
              ? 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/30'
              : 'border-dashed border-border hover:bg-muted/40',
          )}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-border text-rose-600 focus:ring-rose-500/40 w-4 h-4"
            />
            <span className="flex-1 text-sm">
              <span className="block font-semibold">
                Confirmo o cancelamento deste atendimento
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                A ação fica registrada no log com o motivo informado e não pode
                ser desfeita.
              </span>
            </span>
          </label>
        </div>

        <footer className="px-5 py-3 border-t border-border bg-muted/20 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm font-medium"
          >
            Voltar
          </button>
          <button
            onClick={() => canSubmit && onConfirm(reason.trim())}
            disabled={!canSubmit}
            title={
              !reasonValid ? 'Informe o motivo (mín. 3 caracteres)'
              : !confirmed ? 'Marque a caixa de confirmação'
              : undefined
            }
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-sm font-bold shadow-md shadow-rose-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin" /> Cancelando…</>
              : <><X size={14} /> Confirmar cancelamento</>}
          </button>
        </footer>
      </div>
    </div>
  )
}

function ExtraAddressRow({
  address, onEdit, onDelete,
}: {
  address: PatientAddressOut
  onEdit: () => void
  onDelete: () => void
}) {
  const line = [
    address.endereco,
    address.numero,
    address.complemento,
  ].filter(Boolean).join(', ')
  const cityLine = [
    address.bairro,
    [address.municipioIbge, address.uf].filter(Boolean).join('/'),
  ].filter(Boolean).join(' · ')
  return (
    <li className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors">
      <span className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
        <MapPin size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{address.label}</p>
        <p className="text-xs text-muted-foreground truncate">
          {line || <span className="italic">Endereço sem dados</span>}
        </p>
        {cityLine && (
          <p className="text-[11px] text-muted-foreground truncate">{cityLine}</p>
        )}
        {address.observacao && (
          <p className="text-[11px] text-muted-foreground italic mt-0.5 truncate">
            {address.observacao}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          title="Editar endereço"
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-muted"
        >
          <Edit3 size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Remover endereço"
          className="p-2 rounded-lg text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}

function ExtraAddressModal({
  initial, saving, onCancel, onSubmit,
}: {
  initial: PatientAddressOut | null
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: PatientAddressInput) => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [cep, setCep] = useState(initial?.cep ?? '')
  const [endereco, setEndereco] = useState(initial?.endereco ?? '')
  const [numero, setNumero] = useState(initial?.numero ?? '')
  const [complemento, setComplemento] = useState(initial?.complemento ?? '')
  const [bairro, setBairro] = useState(initial?.bairro ?? '')
  const [uf, setUf] = useState(initial?.uf ?? '')
  const [municipioIbge, setMunicipioIbge] = useState(initial?.municipioIbge ?? '')
  const [municipioDisplay, setMunicipioDisplay] = useState('')
  const [observacao, setObservacao] = useState(initial?.observacao ?? '')
  const [cepLoading, setCepLoading] = useState(false)

  const handleCep = async (v: string) => {
    setCep(v)
    const digits = v.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const addr = await fetchCep(digits)
      if (!addr) return
      if (addr.logradouro) setEndereco(addr.logradouro)
      if (addr.bairro) setBairro(addr.bairro)
      if (addr.complemento) setComplemento(addr.complemento)
      if (addr.uf) setUf(addr.uf)
      if (addr.ibge) setMunicipioIbge(addr.ibge)
      if (addr.localidade) setMunicipioDisplay(addr.localidade)
    } finally {
      setCepLoading(false)
    }
  }

  const canSave = label.trim().length > 0
  const cityLabel = municipioDisplay || (municipioIbge ? `IBGE ${municipioIbge}` : '')

  return (
    <div onClick={onCancel} className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {initial ? 'Editar endereço' : 'Novo endereço'}
          </h3>
          <button onClick={onCancel} className="p-1.5 rounded text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </header>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <FormField label="Descrição">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value.slice(0, 60))}
              placeholder="Ex.: Trabalho, Casa da mãe, Sítio"
              autoFocus
              maxLength={60}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <FormField label="CEP">
              <div className="relative">
                <MaskedInput
                  mask={cepMask}
                  value={cep}
                  onChange={handleCep}
                  placeholder="00000-000"
                  className="w-full text-base px-4 py-3 pr-9"
                />
                {cepLoading && (
                  <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
            </FormField>
            <FormField label="Cidade · UF">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={cityLabel}
                  readOnly
                  placeholder="Preenchido via CEP"
                  className="flex-1 px-4 py-3 rounded-lg border border-border bg-muted/40 text-base text-muted-foreground"
                />
                <input
                  type="text"
                  value={uf}
                  onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="UF"
                  className="w-20 px-3 py-3 rounded-lg border border-border bg-background text-base text-center uppercase"
                />
              </div>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
            <FormField label="Logradouro">
              <input
                type="text"
                value={endereco}
                onChange={e => setEndereco(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base"
              />
            </FormField>
            <FormField label="Número">
              <input
                type="text"
                value={numero}
                onChange={e => setNumero(e.target.value)}
                placeholder="S/N"
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Complemento">
              <input
                type="text"
                value={complemento}
                onChange={e => setComplemento(e.target.value)}
                placeholder="Apto, bloco, ponto de referência"
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base"
              />
            </FormField>
            <FormField label="Bairro">
              <input
                type="text"
                value={bairro}
                onChange={e => setBairro(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base"
              />
            </FormField>
          </div>

          <FormField label="Observação">
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value.slice(0, 500))}
              placeholder="Detalhes adicionais — referência, horário, etc."
              rows={2}
              maxLength={500}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </FormField>
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={() => canSave && onSubmit({
              label: label.trim(),
              cep, endereco, numero, complemento, bairro,
              municipioIbge, uf,
              observacao,
            })}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {initial ? 'Salvar' : 'Adicionar'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-[11px] font-medium text-slate-700 dark:text-slate-300">
      {icon}{children}
    </span>
  )
}

type InfoTone = 'neutral' | 'info' | 'celebrate'

function InfoCard({
  icon, label, value, hint, tone = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: InfoTone
}) {
  const styles: Record<InfoTone, string> = {
    neutral: 'bg-card border-border',
    info: 'bg-sky-50/60 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900',
    celebrate: 'bg-gradient-to-br from-fuchsia-50 to-rose-50 dark:from-fuchsia-950/30 dark:to-rose-950/30 border-fuchsia-300 dark:border-fuchsia-800',
  }
  const iconStyles: Record<InfoTone, string> = {
    neutral: 'bg-muted text-slate-600 dark:text-slate-300',
    info: 'bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300',
    celebrate: 'bg-fuchsia-500 text-white',
  }
  return (
    <div className={cn('rounded-xl border p-3 flex items-start gap-3', styles[tone])}>
      <span className={cn('w-9 h-9 rounded-lg shrink-0 flex items-center justify-center', iconStyles[tone])}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {label}
        </p>
        <p className="text-sm font-semibold truncate mt-0.5">{value}</p>
        {hint && (
          <p className="text-[11px] text-muted-foreground truncate">{hint}</p>
        )}
      </div>
    </div>
  )
}

interface MissingGroup {
  section: string
  fields: string[]
  /** true = todos os campos do grupo são editáveis no wizard (step 2).
   *  false = precisa abrir a ficha completa pra resolver. */
  inQuickForm: boolean
}

/** Audita a ficha do paciente e retorna as seções que têm pelo menos
 *  um campo "importante" vazio. A lista é propositalmente ampla — o
 *  papel da recepção é manter o cadastro sempre atualizado. */
function computeMissingGroups(p: PatientRead): MissingGroup[] {
  const isEmpty = (v: string | null | undefined) => !v || !v.toString().trim()
  const groups: MissingGroup[] = []

  // Identificação
  const ident: string[] = []
  if (!p.cpf && !p.cns) ident.push('CPF ou CNS')
  if (!p.birthDate) ident.push('data de nascimento')
  if (!p.sex) ident.push('sexo')
  if (isEmpty(p.socialName) && isEmpty(p.name)) ident.push('nome')
  if (ident.length) groups.push({ section: 'Identificação', fields: ident, inQuickForm: false })

  // Filiação
  const fil: string[] = []
  if (isEmpty(p.motherName) && !p.motherUnknown) fil.push('nome da mãe')
  if (isEmpty(p.fatherName) && !p.fatherUnknown) fil.push('nome do pai')
  if (fil.length) groups.push({ section: 'Filiação', fields: fil, inQuickForm: false })

  // Contato
  const cont: string[] = []
  if (isEmpty(p.cellphone) && isEmpty(p.phone)) cont.push('celular ou telefone')
  if (isEmpty(p.email)) cont.push('e-mail')
  if (cont.length) groups.push({ section: 'Contato', fields: cont, inQuickForm: true })

  // Endereço
  const end: string[] = []
  if (isEmpty(p.cep)) end.push('CEP')
  if (isEmpty(p.endereco)) end.push('logradouro')
  if (isEmpty(p.numero)) end.push('número')
  if (isEmpty(p.bairro)) end.push('bairro')
  if (isEmpty(p.municipioIbge) || isEmpty(p.uf)) end.push('cidade/UF')
  if (end.length) groups.push({ section: 'Endereço', fields: end, inQuickForm: true })

  // Sociodemográfico
  const demo: string[] = []
  if (!p.racaId) demo.push('raça/cor')
  if (!p.escolaridadeId) demo.push('escolaridade')
  if (!p.estadoCivilId) demo.push('estado civil')
  if (!p.nacionalidadeId) demo.push('nacionalidade')
  if (demo.length) groups.push({ section: 'Sociodemográfico', fields: demo, inQuickForm: false })

  // Socioeconômico
  const socio: string[] = []
  if (isEmpty(p.ocupacaoLivre) && !p.cboId) socio.push('ocupação')
  if (p.rendaFamiliar === null || p.rendaFamiliar === undefined) socio.push('renda familiar')
  if (socio.length) groups.push({ section: 'Socioeconômico', fields: socio, inQuickForm: false })

  // Contato de emergência
  const emerg: string[] = []
  if (isEmpty(p.contatoEmergenciaNome)) emerg.push('nome')
  if (isEmpty(p.contatoEmergenciaTelefone)) emerg.push('telefone')
  if (emerg.length) groups.push({ section: 'Contato de emergência', fields: emerg, inQuickForm: false })

  return groups
}

function capitalizeFirst(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "há 3 dias", "há 2 meses", "há 1 ano". Datas no futuro viram "—". */
function formatRelativePast(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  if (diffMs < 0) return '—'
  const hours = diffMs / (1000 * 60 * 60)
  if (hours < 1) return 'há menos de 1 hora'
  if (hours < 24) {
    const h = Math.round(hours)
    return `há ${h} ${h === 1 ? 'hora' : 'horas'}`
  }
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const months = Math.floor(days / 30)
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(days / 365)
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`
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

function humanTicketStatus(status: string): string {
  switch (status) {
    case 'reception_waiting': return 'aguardando chamada'
    case 'reception_called': return 'chamado'
    case 'reception_attending': return 'em atendimento'
    case 'triagem_waiting': return 'aguardando triagem'
    case 'sector_waiting': return 'aguardando setor'
    default: return status.replace(/_/g, ' ')
  }
}
