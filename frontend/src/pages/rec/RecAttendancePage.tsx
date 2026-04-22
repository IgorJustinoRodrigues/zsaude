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
  ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Clock, Edit3, Loader2,
  MapPin, PhoneCall, Phone, ShieldAlert, Star, User, X,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { PatientPhotoImg } from '../hsp/components/PatientPhotoImg'
import { FaceRecognitionModal } from '../hsp/components/FaceRecognitionModal'
import { FormField } from '../../components/ui/FormField'
import { MaskedInput } from '../../components/ui/MaskedInput'
import { hspApi, type PatientRead } from '../../api/hsp'
import { recApi, type AttendanceItem } from '../../api/rec'
import { recConfigApi } from '../../api/recConfig'
import { sectorsApi, type Sector } from '../../api/sectors'
import { dataUrlToBlob } from '../../api/face'
import { fetchCep } from '../../api/viacep'
import { HttpError } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/toastStore'
import { promptDialog, confirmDialog } from '../../store/dialogStore'
import { cepMask, phoneMask } from '../../lib/masks'
import { formatCPF, formatDate, calcAge, initials, cn } from '../../lib/utils'

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

  // Campos editáveis na etapa 2. Começam populados do paciente e só
  // viram patch quando algo realmente mudou.
  const [phone, setPhone] = useState('')
  const [cellphone, setCellphone] = useState('')
  const [cep, setCep] = useState('')
  const [endereco, setEndereco] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [uf, setUf] = useState('')
  const [municipioIbge, setMunicipioIbge] = useState('')
  const [municipioDisplay, setMunicipioDisplay] = useState('')
  const [savingData, setSavingData] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)

  // Upload de foto quando paciente não tem
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

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
    ]).then(([p, tickets, sectorsRes, cfg]) => {
      if (cancelled) return
      setPatient(p)
      setPhone(p.phone ?? '')
      setCellphone(p.cellphone ?? '')
      setCep(p.cep ?? '')
      setEndereco(p.endereco ?? '')
      setNumero(p.numero ?? '')
      setComplemento(p.complemento ?? '')
      setBairro(p.bairro ?? '')
      setUf(p.uf ?? '')
      setMunicipioIbge(p.municipioIbge ?? '')
      setMunicipioDisplay('')
      const active = tickets.find(t =>
        t.patientId === patientId && ACTIVE_STATUSES.has(t.status),
      ) ?? null
      setTicket(active)
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

  // ── CEP autofill ────────────────────────────────────────────────
  const handleCepLookup = useCallback(async (newCep: string) => {
    setCep(newCep)
    const digits = newCep.replace(/\D/g, '')
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
  }, [])

  // ── Ações ──────────────────────────────────────────────────────
  const saveDataIfDirty = useCallback(async (): Promise<boolean> => {
    if (!patient) return true
    const patch: Record<string, string> = {}
    if (phone !== (patient.phone ?? '')) patch.phone = phone
    if (cellphone !== (patient.cellphone ?? '')) patch.cellphone = cellphone
    if (cep !== (patient.cep ?? '')) patch.cep = cep
    if (endereco !== (patient.endereco ?? '')) patch.endereco = endereco
    if (numero !== (patient.numero ?? '')) patch.numero = numero
    if (complemento !== (patient.complemento ?? '')) patch.complemento = complemento
    if (bairro !== (patient.bairro ?? '')) patch.bairro = bairro
    if (uf !== (patient.uf ?? '')) patch.uf = uf
    if (municipioIbge !== (patient.municipioIbge ?? '')) patch.municipioIbge = municipioIbge
    if (Object.keys(patch).length === 0) return true
    setSavingData(true)
    try {
      const updated = await hspApi.update(patient.id, patch)
      setPatient(updated)
      toast.success('Dados atualizados')
      return true
    } catch (err) {
      if (err instanceof HttpError) toast.error('Salvar dados', err.message)
      return false
    } finally {
      setSavingData(false)
    }
  }, [patient, phone, cellphone, cep, endereco, numero, complemento, bairro, uf, municipioIbge])

  // ── Upload de foto (quando paciente não tem) ──────────────────
  const handlePhotoCaptured = useCallback(async (dataUrl: string) => {
    if (!patient) return
    setUploadingPhoto(true)
    try {
      const blob = dataUrlToBlob(dataUrl)
      const updated = await hspApi.uploadPhoto(patient.id, blob)
      setPatient(updated)
      toast.success('Foto adicionada ao cadastro')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Upload', err.message)
      else toast.error('Upload', 'Falha ao enviar foto.')
    } finally {
      setUploadingPhoto(false)
      setUploadModalOpen(false)
    }
  }, [patient])

  async function handleForward() {
    if (!ticket || !effectiveSector) return
    // Salva qualquer edição pendente antes de encaminhar — evita perder
    // dados se atendente voltou pra etapa 3 sem clicar "continuar".
    const ok = await saveDataIfDirty()
    if (!ok) return
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
    setCalling(true)
    try {
      await recApi.publishCall({
        ticket: ticket.ticketNumber,
        patientName: ticket.patientName,
        priority: ticket.priority,
      })
      toast.success('Rechamado no painel', ticket.ticketNumber)
    } catch (err) {
      if (err instanceof HttpError) toast.error('Rechamar', err.message)
    } finally {
      window.setTimeout(() => setCalling(false), 5000)
    }
  }

  async function handleCancel() {
    if (!ticket) return
    const reason = await promptDialog({
      title: 'Cancelar atendimento',
      message: `Senha ${ticket.ticketNumber}. Informe o motivo — fica no log.`,
      placeholder: 'Ex.: paciente desistiu, duplicidade…',
      confirmLabel: 'Cancelar atendimento',
      variant: 'danger',
    })
    if (!reason) return
    setCancelling(true)
    try {
      await recApi.cancelTicket(ticket.id, reason)
      toast.success('Atendimento cancelado')
      navigate('/rec/atendimento')
    } catch (err) {
      if (err instanceof HttpError) toast.error('Cancelar', err.message)
    } finally {
      setCancelling(false)
    }
  }

  async function handleBack() {
    const dirty = patient && (
      phone !== (patient.phone ?? '') ||
      cellphone !== (patient.cellphone ?? '') ||
      cep !== (patient.cep ?? '') ||
      endereco !== (patient.endereco ?? '') ||
      numero !== (patient.numero ?? '') ||
      complemento !== (patient.complemento ?? '') ||
      bairro !== (patient.bairro ?? '') ||
      uf !== (patient.uf ?? '') ||
      municipioIbge !== (patient.municipioIbge ?? '')
    )
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Sair sem salvar?',
        message: 'Você alterou dados do paciente que ainda não foram salvos.',
        confirmLabel: 'Sair assim mesmo',
        variant: 'danger',
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
        labels={['Identidade', 'Dados rápidos', 'Encaminhamento']}
        onJump={s => setStep(s)}
      />

      {step === 1 && (
        <StepIdentity
          patient={patient}
          ticket={ticket}
          calling={calling}
          uploadingPhoto={uploadingPhoto}
          onRecall={handleRecall}
          onRequestPhotoUpload={() => setUploadModalOpen(true)}
          onEditFull={() => navigate(`/rec/atendimento/${patient.id}/ficha`)}
          onNext={() => setStep(2)}
          onBack={handleBack}
        />
      )}

      {step === 2 && (
        <StepQuickData
          phone={phone} setPhone={setPhone}
          cellphone={cellphone} setCellphone={setCellphone}
          cep={cep} onCepChange={handleCepLookup} cepLoading={cepLoading}
          endereco={endereco} setEndereco={setEndereco}
          numero={numero} setNumero={setNumero}
          complemento={complemento} setComplemento={setComplemento}
          bairro={bairro} setBairro={setBairro}
          uf={uf} setUf={setUf}
          municipioIbge={municipioIbge}
          municipioDisplay={municipioDisplay}
          saving={savingData}
          onPrev={() => setStep(1)}
          onNext={async () => {
            const ok = await saveDataIfDirty()
            if (ok) setStep(3)
          }}
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

      {step === 3 && (
        <StepForward
          sectors={visibleSectors}
          selected={effectiveSector}
          suggested={suggestedSector}
          onSelect={setSelectedSector}
          ticket={ticket}
          forwarding={forwarding}
          cancelling={cancelling}
          onForward={handleForward}
          onCancel={handleCancel}
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
  patient, ticket, calling, uploadingPhoto,
  onRecall, onRequestPhotoUpload, onEditFull, onNext, onBack,
}: {
  patient: PatientRead
  ticket: AttendanceItem | null
  calling: boolean
  uploadingPhoto: boolean
  onRecall: () => void
  onRequestPhotoUpload: () => void
  onEditFull: () => void
  onNext: () => void
  onBack: () => void
}) {
  const display = patient.socialName || patient.name
  const hasPhoto = !!patient.currentPhotoId
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
              {calling ? 'Aguarde…' : 'Rechamar no painel'}
            </button>
          </div>
        )}
      </div>

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

// ─── Etapa 2: Dados rápidos ──────────────────────────────────────────────

function StepQuickData({
  phone, setPhone, cellphone, setCellphone,
  cep, onCepChange, cepLoading,
  endereco, setEndereco, numero, setNumero,
  complemento, setComplemento, bairro, setBairro,
  uf, setUf, municipioIbge, municipioDisplay,
  saving, onPrev, onNext,
}: {
  phone: string; setPhone: (v: string) => void
  cellphone: string; setCellphone: (v: string) => void
  cep: string; onCepChange: (v: string) => void; cepLoading: boolean
  endereco: string; setEndereco: (v: string) => void
  numero: string; setNumero: (v: string) => void
  complemento: string; setComplemento: (v: string) => void
  bairro: string; setBairro: (v: string) => void
  uf: string; setUf: (v: string) => void
  municipioIbge: string
  municipioDisplay: string
  saving: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const cityLabel = municipioDisplay || (municipioIbge ? `IBGE ${municipioIbge}` : '')
  return (
    <section className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
            <Phone size={14} /> Contato
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Mantenha celular e telefone sempre atualizados — usamos pra avisos.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Celular">
              <MaskedInput
                mask={phoneMask}
                value={cellphone}
                onChange={setCellphone}
                placeholder="(00) 00000-0000"
                className="w-full text-base px-4 py-3"
              />
            </FormField>
            <FormField label="Telefone fixo">
              <MaskedInput
                mask={phoneMask}
                value={phone}
                onChange={setPhone}
                placeholder="(00) 0000-0000"
                className="w-full text-base px-4 py-3"
              />
            </FormField>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
            <MapPin size={14} /> Endereço
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Informe o CEP — o endereço é preenchido automaticamente e pode
            ser ajustado.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <FormField label="CEP">
              <div className="relative">
                <MaskedInput
                  mask={cepMask}
                  value={cep}
                  onChange={onCepChange}
                  placeholder="00000-000"
                  className="w-full text-base px-4 py-3 pr-9"
                />
                {cepLoading && (
                  <Loader2
                    size={14}
                    className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                )}
              </div>
            </FormField>
            <FormField label="Cidade · UF">
              <div className="flex items-center gap-2 h-full">
                <input
                  type="text"
                  value={cityLabel}
                  readOnly
                  placeholder="Preenchido via CEP"
                  className="flex-1 px-4 py-3 rounded-lg border border-border bg-muted/40 text-base text-muted-foreground cursor-not-allowed"
                />
                <input
                  type="text"
                  value={uf}
                  onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="UF"
                  className="w-20 px-3 py-3 rounded-lg border border-border bg-background text-base text-center uppercase focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3 mt-3">
            <FormField label="Logradouro">
              <input
                type="text"
                value={endereco}
                onChange={e => setEndereco(e.target.value)}
                placeholder="Rua / avenida"
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </FormField>
            <FormField label="Número">
              <input
                type="text"
                value={numero}
                onChange={e => setNumero(e.target.value)}
                placeholder="S/N"
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <FormField label="Complemento">
              <input
                type="text"
                value={complemento}
                onChange={e => setComplemento(e.target.value)}
                placeholder="Apto, bloco, ponto de referência"
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </FormField>
            <FormField label="Bairro">
              <input
                type="text"
                value={bairro}
                onChange={e => setBairro(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </FormField>
          </div>
        </div>
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
          onClick={onNext}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" /> Salvando…</>
            : <>Continuar <ArrowRight size={14} /></>}
        </button>
      </div>
    </section>
  )
}

// ─── Etapa 3: Encaminhamento ─────────────────────────────────────────────

function StepForward({
  sectors, selected, suggested, onSelect, ticket,
  forwarding, cancelling, onForward, onCancel, onPrev,
}: {
  sectors: Sector[]
  selected: string | null
  suggested: string | null
  onSelect: (name: string) => void
  ticket: AttendanceItem | null
  forwarding: boolean
  cancelling: boolean
  onForward: () => void
  onCancel: () => void
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
        <button
          onClick={onCancel}
          disabled={cancelling || !ticket}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
        >
          {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          Cancelar atendimento
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

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-[11px] font-medium text-slate-700 dark:text-slate-300">
      {icon}{children}
    </span>
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
