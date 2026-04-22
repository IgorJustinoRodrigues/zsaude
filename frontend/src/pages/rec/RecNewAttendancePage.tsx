// Localiza um cidadão cadastrado e inicia um atendimento direto do balcão,
// sem precisar do totem. Reusa patterns de HspPatientSearchPage (lookup
// multi-critério + reconhecimento facial).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Clock, Images, Loader2, RotateCcw,
  ScanFace, Search, Sparkles, Star, UserPlus, X, ZoomIn,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { MaskedInput } from '../../components/ui/MaskedInput'
import { FormField } from '../../components/ui/FormField'
import { cpfMask, cnsMask } from '../../lib/masks'
import { FaceRecognitionModal } from '../hsp/components/FaceRecognitionModal'
import { PhotoGalleryModal } from '../hsp/components/PhotoGalleryModal'
import { PatientPhotoImg } from '../hsp/components/PatientPhotoImg'
import { hspApi, type PatientListItem, type PatientPhotoMeta } from '../../api/hsp'
import { recApi, type AttendanceItem } from '../../api/rec'
import { dataUrlToBlob, type MatchCandidate } from '../../api/face'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { formatCPF, formatDate, calcAge, initials, cn } from '../../lib/utils'

type Mode = 'doc' | 'personal' | 'face'

export function RecNewAttendancePage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('doc')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PatientListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [emitting, setEmitting] = useState<string | null>(null)
  const [faceOpen, setFaceOpen] = useState(false)
  const [faceCandidates, setFaceCandidates] = useState<MatchCandidate[] | null>(null)
  /** Foto capturada no match — guardada pra subir ao catálogo quando
   *  o atendente confirma a identidade do top candidato. */
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null)
  /** true enquanto olha só o top candidato (passo de confirmação).
   *  false = lista completa já aberta. */
  const [faceShowList, setFaceShowList] = useState(false)

  // Campos dos modos
  const [cpf, setCpf] = useState('')
  const [cns, setCns] = useState('')
  const [name, setName] = useState('')
  const [birth, setBirth] = useState('')
  const [mother, setMother] = useState('')
  const [father, setFather] = useState('')

  const canSearchDoc = cpf.replace(/\D/g, '').length === 11 || cns.replace(/\D/g, '').length === 15
  const canSearchPersonal = name.trim().length >= 3
    && (birth || mother.trim().length >= 3 || father.trim().length >= 3)

  async function search(mode: Mode) {
    setError(null)
    setResults([])
    setFaceCandidates(null)
    setSearching(true)
    try {
      if (mode === 'doc') {
        const items = await hspApi.lookup({
          cpf: cpf.replace(/\D/g, '') || undefined,
          cns: cns.replace(/\D/g, '') || undefined,
          limit: 10,
        })
        setResults(items)
        if (items.length === 0) setError('Nenhum paciente encontrado.')
      } else if (mode === 'personal') {
        const items = await hspApi.lookup({
          name: name.trim() || undefined,
          birthDate: birth || undefined,
          motherName: mother.trim() || undefined,
          fatherName: father.trim() || undefined,
          limit: 20,
        })
        setResults(items)
        if (items.length === 0) setError('Nenhum paciente encontrado.')
      }
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'Erro na busca.')
    } finally {
      setSearching(false)
    }
  }

  async function startAttendance(patientId: string, patientName: string, priority: boolean) {
    setEmitting(patientId)
    try {
      const out = await recApi.emitManualTicket(patientId, priority)
      toast.success('Atendimento iniciado', `${out.ticketNumber} · ${patientName}`)
      // A ficha cadastral é a tela de atendimento — recepção revisa/atualiza
      // os dados enquanto o paciente aguarda. Botão "Voltar" do form leva
      // de volta pra fila quando terminar.
      navigate(`/rec/atendimento/${patientId}`)
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 409 && typeof err.details?.existingTicket === 'string') {
          toast.warning(
            'Paciente já na fila',
            `Senha existente: ${err.details.existingTicket}`,
          )
          // Mesmo quando já tem senha, abre a ficha pra edição —
          // atualização de dados cadastrais continua fazendo sentido.
          navigate(`/rec/atendimento/${patientId}`)
        } else {
          toast.error('Falha', err.message)
        }
      }
    } finally {
      setEmitting(null)
    }
  }

  /** Confirma identidade do top candidato: sobe a nova foto no catálogo
   *  (o backend já enrola o embedding) e dispara o atendimento. */
  async function confirmFaceMatchAndStart(
    candidate: MatchCandidate, priority: boolean,
  ) {
    const displayName = candidate.socialName || candidate.name
    if (capturedDataUrl) {
      try {
        const blob = dataUrlToBlob(capturedDataUrl)
        await hspApi.uploadPhoto(candidate.patientId, blob)
      } catch (err) {
        // Não bloqueia o atendimento — só avisa que a foto não entrou.
        console.warn('[rec] face enroll after match failed:', err)
        toast.warning(
          'Foto não adicionada ao catálogo',
          'O atendimento segue normalmente.',
        )
      }
    }
    await startAttendance(candidate.patientId, displayName, priority)
  }

  return (
    <div>
      <PageHeader
        title="Novo atendimento"
        subtitle="Localize o cidadão e inicie o atendimento no balcão."
        back="/rec/atendimento"
      />

      {/* Seletor de modo — 3 cards grandes */}
      <section className="mb-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Identificar cidadão
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ModeCard
            active={mode === 'doc'}
            onClick={() => setMode('doc')}
            icon={<Search size={24} />}
            accent="teal"
            title="CPF ou CNS"
            description="Busca rápida pelo documento do cidadão."
          />
          <ModeCard
            active={mode === 'personal'}
            onClick={() => setMode('personal')}
            icon={<UserPlus size={24} />}
            accent="indigo"
            title="Nome completo"
            description="Pesquisa por nome — use nascimento ou mãe pra desambiguar."
          />
          <ModeCard
            active={mode === 'face'}
            onClick={() => { setMode('face'); setFaceOpen(true) }}
            icon={<ScanFace size={24} />}
            accent="sky"
            title="Reconhecimento facial"
            description="Tira uma foto e compara com a base do município."
          />
        </div>
      </section>

      {/* Form por modo */}
      {mode === 'doc' && (
        <section className="bg-card rounded-xl border border-border p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="CPF">
              <MaskedInput
                mask={cpfMask}
                value={cpf}
                onChange={setCpf}
                placeholder="000.000.000-00"
                className="w-full text-base px-4 py-3"
              />
            </FormField>
            <FormField label="CNS">
              <MaskedInput
                mask={cnsMask}
                value={cns}
                onChange={setCns}
                placeholder="000 0000 0000 0000"
                className="w-full text-base px-4 py-3"
              />
            </FormField>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => search('doc')}
              disabled={!canSearchDoc || searching}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Buscar
            </button>
          </div>
        </section>
      )}

      {mode === 'personal' && (
        <section className="bg-card rounded-xl border border-border p-5 mb-4">
          <div className="grid grid-cols-1 gap-4">
            <FormField label="Nome completo">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome como está no cadastro"
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </FormField>
            <FormField label="Data de nascimento">
              <input
                type="date"
                value={birth}
                onChange={e => setBirth(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Nome da mãe">
                <input
                  type="text"
                  value={mother}
                  onChange={e => setMother(e.target.value)}
                  placeholder="Ajuda a desambiguar homônimos"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </FormField>
              <FormField label="Nome do pai">
                <input
                  type="text"
                  value={father}
                  onChange={e => setFather(e.target.value)}
                  placeholder="Opcional — ajuda em homônimos"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </FormField>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => search('personal')}
              disabled={!canSearchPersonal || searching}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Buscar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Informe o nome + (data de nascimento OU nome da mãe OU nome do pai) pra filtrar melhor.
          </p>
        </section>
      )}

      {mode === 'face' && (
        <section className="bg-card rounded-xl border border-border p-4 mb-4 text-center">
          <ScanFace size={36} className="mx-auto text-sky-600 dark:text-sky-400 mb-2" />
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-3">
            Tire uma foto do rosto do paciente — o sistema compara com a base
            do município e lista os candidatos.
          </p>
          <button
            onClick={() => setFaceOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold"
          >
            <ScanFace size={14} /> Iniciar reconhecimento
          </button>
          {faceOpen && (
            <FaceRecognitionModal
              mode="match"
              onClose={() => setFaceOpen(false)}
              onMatched={(cands, photo) => {
                setCapturedDataUrl(photo)
                setFaceCandidates(cands)
                setFaceShowList(false)
                setFaceOpen(false)
                if (cands.length === 0) setError('Nenhum candidato encontrado.')
              }}
            />
          )}
        </section>
      )}

      {error && (
        <div className="max-w-2xl mb-4 flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Resultados do lookup tradicional */}
      {results.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">
            {results.length} paciente{results.length === 1 ? '' : 's'} encontrado{results.length === 1 ? '' : 's'}
          </h3>
          <ul className="space-y-2">
            {results.map(p => (
              <PatientResultRow
                key={p.id}
                patient={{
                  id: p.id,
                  name: p.name,
                  socialName: p.socialName,
                  cpf: p.cpf,
                  birthDate: p.birthDate,
                  hasPhoto: p.hasPhoto,
                }}
                emitting={emitting === p.id}
                onStart={priority => startAttendance(
                  p.id, p.socialName || p.name, priority,
                )}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Top candidato do match — atendente confirma identidade. */}
      {faceCandidates && faceCandidates.length > 0 && !faceShowList && (
        <FaceMatchConfirm
          top={faceCandidates[0]}
          capturedDataUrl={capturedDataUrl}
          emitting={emitting === faceCandidates[0].patientId}
          hasMore={faceCandidates.length > 1}
          onConfirm={priority => confirmFaceMatchAndStart(faceCandidates[0], priority)}
          onReject={() => setFaceShowList(true)}
          onRetry={() => {
            setFaceCandidates(null)
            setCapturedDataUrl(null)
            setFaceOpen(true)
          }}
        />
      )}

      {/* Lista completa — aparece quando atendente rejeita o top match. */}
      {faceCandidates && faceCandidates.length > 0 && faceShowList && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {faceCandidates.length} candidato{faceCandidates.length === 1 ? '' : 's'} pelo rosto
            </h3>
            <button
              onClick={() => setFaceShowList(false)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            >
              ← voltar à confirmação
            </button>
          </div>
          <ul className="space-y-2">
            {faceCandidates.map(c => (
              <PatientResultRow
                key={c.patientId}
                patient={{
                  id: c.patientId,
                  name: c.name,
                  socialName: c.socialName,
                  cpf: null,
                  birthDate: c.birthDate,
                  hasPhoto: c.hasPhoto,
                }}
                badge={<SimilarityBadge value={c.similarity} />}
                emitting={emitting === c.patientId}
                onStart={priority => confirmFaceMatchAndStart(c, priority)}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6">
        <button
          onClick={() => navigate('/rec/atendimento')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <ArrowLeft size={12} /> Voltar à fila
        </button>
      </div>
    </div>
  )
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

type CardAccent = 'teal' | 'indigo' | 'sky'

const ACCENT_CLASSES: Record<CardAccent, { ring: string; iconBg: string; iconFg: string }> = {
  teal: {
    ring: 'ring-teal-500/70 border-teal-500 bg-teal-50/40 dark:bg-teal-950/30',
    iconBg: 'bg-teal-100 dark:bg-teal-950 group-hover:bg-teal-200 dark:group-hover:bg-teal-900',
    iconFg: 'text-teal-700 dark:text-teal-300',
  },
  indigo: {
    ring: 'ring-indigo-500/70 border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30',
    iconBg: 'bg-indigo-100 dark:bg-indigo-950 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900',
    iconFg: 'text-indigo-700 dark:text-indigo-300',
  },
  sky: {
    ring: 'ring-sky-500/70 border-sky-500 bg-sky-50/40 dark:bg-sky-950/30',
    iconBg: 'bg-sky-100 dark:bg-sky-950 group-hover:bg-sky-200 dark:group-hover:bg-sky-900',
    iconFg: 'text-sky-700 dark:text-sky-300',
  },
}

function ModeCard({
  active, onClick, icon, title, description, accent,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
  accent: CardAccent
}) {
  const colors = ACCENT_CLASSES[accent]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group text-left rounded-xl border p-4 transition-all flex items-start gap-3',
        active
          ? `border-2 ring-2 ${colors.ring}`
          : 'border-border bg-card hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm',
      )}
    >
      <span className={cn(
        'w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-colors',
        colors.iconBg, colors.iconFg,
      )}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-[12px] text-muted-foreground mt-0.5 leading-snug">
          {description}
        </span>
      </span>
    </button>
  )
}

interface ResultPatient {
  id: string
  name: string
  socialName: string
  cpf: string | null
  birthDate: string | null
  hasPhoto: boolean
}

function PatientResultRow({
  patient, badge, emitting, onStart,
}: {
  patient: ResultPatient
  badge?: React.ReactNode
  emitting: boolean
  onStart: (priority: boolean) => void
}) {
  const [priority, setPriority] = useState(false)
  const display = patient.socialName || patient.name
  return (
    <li className="bg-card border border-border rounded-xl p-3 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-sm font-bold text-muted-foreground">
        {patient.hasPhoto ? (
          <PatientPhotoImg
            patientId={patient.id}
            alt={display}
            className="w-full h-full object-cover"
            fallback={initials(display)}
          />
        ) : initials(display)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{display}</p>
        <p className="text-[11px] text-muted-foreground">
          {patient.cpf && `CPF ${formatCPF(patient.cpf)}`}
          {patient.cpf && patient.birthDate && ' · '}
          {patient.birthDate && `${formatDate(patient.birthDate)} (${calcAge(patient.birthDate)} anos)`}
          {badge && <span className="ml-2">{badge}</span>}
        </p>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={priority}
          onChange={e => setPriority(e.target.checked)}
          className="rounded border-border text-primary focus:ring-primary/40"
        />
        <Star size={11} className="text-red-500" />
        Prioridade
      </label>
      <button
        onClick={() => onStart(priority)}
        disabled={emitting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-wait"
      >
        {emitting
          ? <Loader2 size={13} className="animate-spin" />
          : <><CheckCircle2 size={13} /> Iniciar atendimento <ArrowRight size={13} /></>}
      </button>
    </li>
  )
}

function FaceMatchConfirm({
  top, capturedDataUrl, emitting, hasMore, onConfirm, onReject, onRetry,
}: {
  top: MatchCandidate
  capturedDataUrl: string | null
  emitting: boolean
  hasMore: boolean
  onConfirm: (priority: boolean) => void
  onReject: () => void
  onRetry: () => void
}) {
  const [priority, setPriority] = useState(false)
  const [photos, setPhotos] = useState<PatientPhotoMeta[] | null>(null)
  const [fullCpf, setFullCpf] = useState<string | null>(null)
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<'saved' | 'captured' | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  /** Ticket ativo do paciente (se já estiver na fila). Vai pular a
   *  emissão de nova senha e cair direto numa view de "já em atendimento". */
  const [existingTicket, setExistingTicket] = useState<AttendanceItem | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const navigate = useNavigate()
  const display = top.socialName || top.name
  const pct = Math.round(top.similarity * 100)

  // Busca CPF completo + galeria em paralelo. Tudo best-effort — se
  // falhar, mantém os dados do match (cpfMasked + 1 foto do cadastro).
  useEffect(() => {
    let cancelled = false
    hspApi.get(top.patientId).then(p => {
      if (cancelled) return
      if (p.cpf) setFullCpf(formatCPF(p.cpf))
      setCurrentPhotoId(p.currentPhotoId)
    }).catch(() => {})
    if (top.hasPhoto) {
      hspApi.listPhotos(top.patientId).then(list => {
        if (!cancelled) setPhotos(list)
      }).catch(() => {})
    }
    // Detecta se o paciente já tem atendimento ativo — pula a emissão
    // de nova senha e mostra estado "já na fila" direto.
    recApi.listTickets().then(list => {
      if (cancelled) return
      const found = list.find(t => t.patientId === top.patientId) ?? null
      setExistingTicket(found)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [top.patientId, top.hasPhoto])

  const otherPhotosCount = photos ? Math.max(0, photos.length - 1) : 0
  const tone = top.similarity >= 0.75
    ? {
        label: 'Match forte',
        ring: 'ring-emerald-500/80 shadow-emerald-500/20',
        bar: 'from-emerald-500 to-emerald-400',
        text: 'text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
      }
    : top.similarity >= 0.60
      ? {
          label: 'Match provável',
          ring: 'ring-sky-500/70 shadow-sky-500/20',
          bar: 'from-sky-500 to-sky-400',
          text: 'text-sky-700 dark:text-sky-300',
          dot: 'bg-sky-500',
        }
      : {
          label: 'Match fraco — confira com atenção',
          ring: 'ring-amber-500/70 shadow-amber-500/20',
          bar: 'from-amber-500 to-amber-400',
          text: 'text-amber-700 dark:text-amber-300',
          dot: 'bg-amber-500',
        }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-slate-50 dark:to-slate-900/40 p-6 sm:p-8 mb-4 animate-[pop_0.45s_cubic-bezier(0.18,1.3,0.6,1)_forwards]">
      {/* Varredura luminosa — passa uma vez anunciando o match. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent animate-[sweep_1s_ease-out_0.2s]"
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 relative">
        <div className="flex items-start gap-3">
          <span className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-lg animate-[pop_0.6s_cubic-bezier(0.18,1.3,0.6,1)_0.15s_both]',
            top.similarity >= 0.75 ? 'bg-emerald-500' : top.similarity >= 0.60 ? 'bg-sky-500' : 'bg-amber-500',
          )}>
            <Sparkles size={18} className="text-white" />
          </span>
          <div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight">Paciente identificado</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Compare as fotos e confirme a identidade.
            </p>
          </div>
        </div>
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white dark:bg-slate-900 border border-border shrink-0',
          tone.text,
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', tone.dot)} />
          {tone.label}
        </span>
      </div>

      {/* Comparativo: cadastro × captura */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-center mb-6 relative">
        <FacePanel
          label="Cadastro"
          ringClass={tone.ring}
          onClick={top.hasPhoto ? () => setLightbox('saved') : undefined}
        >
          {top.hasPhoto ? (
            <PatientPhotoImg
              patientId={top.patientId}
              alt={display}
              className="w-full h-full object-cover"
              fallback={<InitialsFallback name={display} />}
            />
          ) : <InitialsFallback name={display} />}
        </FacePanel>

        {/* Separador — % e barra. Anima em crescimento após o mount. */}
        <div className="flex flex-col items-center gap-1.5 px-1">
          <span className={cn(
            'text-3xl sm:text-4xl font-black tabular-nums animate-[pop_0.5s_cubic-bezier(0.18,1.3,0.6,1)_0.25s_both]',
            tone.text,
          )}>
            {pct}<span className="text-xl">%</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            similaridade
          </span>
          <div className="h-1.5 w-20 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1">
            <div
              className={cn('h-full bg-gradient-to-r', tone.bar)}
              style={{
                width: `${Math.max(6, pct)}%`,
                animation: 'slideIn 0.7s ease-out 0.3s both',
              }}
            />
          </div>
        </div>

        <FacePanel
          label="Agora"
          ringClass={tone.ring}
          onClick={capturedDataUrl ? () => setLightbox('captured') : undefined}
        >
          {capturedDataUrl ? (
            <img src={capturedDataUrl} alt="captura" className="w-full h-full object-cover" />
          ) : (
            <ScanFace size={56} className="text-muted-foreground" />
          )}
        </FacePanel>
      </div>

      {/* Identidade em cartão destacado */}
      <div className="bg-white dark:bg-slate-950/60 border border-border rounded-xl p-4 sm:p-5 mb-5 relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xl sm:text-2xl font-bold truncate">{display}</p>
          {otherPhotosCount > 0 && (
            <button
              onClick={() => setGalleryOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium transition-colors"
              title="Abrir galeria de fotos cadastradas"
            >
              <Images size={13} />
              Ver outras fotos
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold">
                {otherPhotosCount}
              </span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {top.birthDate && (
            <InfoChip>{formatDate(top.birthDate)} · {calcAge(top.birthDate)} anos</InfoChip>
          )}
          {(fullCpf || top.cpfMasked) && (
            <InfoChip>CPF {fullCpf ?? top.cpfMasked}</InfoChip>
          )}
        </div>
      </div>

      {existingTicket ? (
        /* Paciente já tem atendimento ativo — skip emissão, enrola foto
         * em background e oferece ir pra fila. */
        <AlreadyInQueueCard
          ticket={existingTicket}
          enrolling={enrolling}
          onGoToQueue={async () => {
            // Confirma identidade (visualmente) + enrola a foto nova
            // antes de navegar — a base facial cresce mesmo quando a
            // senha não é emitida aqui.
            if (capturedDataUrl) {
              setEnrolling(true)
              try {
                const blob = dataUrlToBlob(capturedDataUrl)
                await hspApi.uploadPhoto(top.patientId, blob)
              } catch (err) {
                console.warn('[rec] face enroll on existing-ticket failed:', err)
              } finally {
                setEnrolling(false)
              }
            }
            // Abre a ficha pra revisão de dados — a senha já existe na fila.
            navigate(`/hsp/pacientes/${top.patientId}/editar`)
          }}
          onReject={onReject}
          hasMore={hasMore}
          onRetry={onRetry}
        />
      ) : (
        <>
          {/* Prioridade */}
          <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none mb-5 p-3 rounded-lg border border-dashed border-border hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={priority}
              onChange={e => setPriority(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary/40"
            />
            <Star size={14} className="text-red-500" />
            <span className="font-medium">Atendimento prioritário</span>
            <span className="text-[11px] text-muted-foreground ml-auto">
              Idoso, gestante, PCD, etc.
            </span>
          </label>

          {/* Ações — Sim é o herói, os outros ficam mais discretos. */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => onConfirm(priority)}
              disabled={emitting}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-base font-bold shadow-lg shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-wait transition-all"
            >
              {emitting
                ? <><Loader2 size={18} className="animate-spin" /> Iniciando…</>
                : <><CheckCircle2 size={18} /> Sim, é essa pessoa</>}
            </button>
            <button
              onClick={onReject}
              disabled={!hasMore}
              className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl border border-border hover:bg-muted text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              title={hasMore
                ? 'Ver outros candidatos encontrados'
                : 'Sem outros candidatos — tente tirar outra foto ou buscar por outro critério'}
            >
              Não é
            </button>
            <button
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-muted"
            >
              <RotateCcw size={14} /> Outra foto
            </button>
          </div>
        </>
      )}

      {/* Lightbox — amplia a foto clicada. */}
      {lightbox && (
        <PhotoLightbox
          onClose={() => setLightbox(null)}
          alt={lightbox === 'saved' ? `Cadastro de ${display}` : `Captura de ${display}`}
          src={lightbox === 'captured' ? capturedDataUrl : null}
          patientId={lightbox === 'saved' ? top.patientId : null}
        />
      )}

      {/* Galeria completa. */}
      {galleryOpen && (
        <PhotoGalleryModal
          patientId={top.patientId}
          currentPhotoId={currentPhotoId}
          onClose={() => setGalleryOpen(false)}
          onChanged={() => {
            // Recarrega foto oficial + lista — a atendente pode ter
            // trocado a oficial ou flaggeado algo.
            hspApi.get(top.patientId).then(p => {
              setCurrentPhotoId(p.currentPhotoId)
            }).catch(() => {})
            hspApi.listPhotos(top.patientId).then(setPhotos).catch(() => {})
          }}
        />
      )}
    </section>
  )
}

function FacePanel({
  label, ringClass, children, onClick,
}: {
  label: string
  ringClass: string
  children: React.ReactNode
  /** Se definido, torna o painel clicável com overlay de zoom no hover. */
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <div className="flex flex-col items-center min-w-0">
      <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground mb-2">
        {label}
      </p>
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          'group relative w-full max-w-[220px] aspect-square rounded-2xl bg-muted overflow-hidden flex items-center justify-center',
          'ring-4 shadow-xl', ringClass,
          onClick && 'cursor-zoom-in transition-transform hover:scale-[1.02]',
        )}
      >
        {children}
        {onClick && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
            <ZoomIn size={28} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        )}
      </Tag>
    </div>
  )
}

function AlreadyInQueueCard({
  ticket, enrolling, onGoToQueue, onReject, hasMore, onRetry,
}: {
  ticket: AttendanceItem
  enrolling: boolean
  onGoToQueue: () => void
  onReject: () => void
  hasMore: boolean
  onRetry: () => void
}) {
  const statusLabel = humanTicketStatus(ticket.status)
  return (
    <>
      {/* Banner destacando que paciente já está na fila. */}
      <div className="mb-4 rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/30 p-4 sm:p-5 animate-[slideIn_0.3s_ease-out]">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center shrink-0 shadow-md">
            <Clock size={20} className="text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400">
              Já está na fila
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black tabular-nums text-amber-900 dark:text-amber-200">
                {ticket.ticketNumber}
              </span>
              <span className="text-xs text-amber-800 dark:text-amber-300">
                · {statusLabel}
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-2 ml-[52px]">
          Sem necessidade de emitir nova senha — o paciente já está aguardando.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={onGoToQueue}
          disabled={enrolling}
          className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.99] text-white text-base font-bold shadow-lg shadow-amber-500/25 disabled:opacity-60 disabled:cursor-wait transition-all"
        >
          {enrolling
            ? <><Loader2 size={18} className="animate-spin" /> Atualizando foto…</>
            : <><ArrowRight size={18} /> Abrir ficha</>}
        </button>
        <button
          onClick={onReject}
          disabled={!hasMore}
          className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl border border-border hover:bg-muted text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          title={hasMore
            ? 'Ver outros candidatos encontrados'
            : 'Sem outros candidatos — tire outra foto ou busque por outro critério'}
        >
          Não é
        </button>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-muted"
        >
          <RotateCcw size={14} /> Outra foto
        </button>
      </div>
    </>
  )
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

function PhotoLightbox({
  onClose, src, patientId, alt,
}: {
  onClose: () => void
  src?: string | null
  patientId?: string | null
  alt: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        aria-label="Fechar"
      >
        <X size={20} />
      </button>
      <div
        onClick={e => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] animate-[pop_0.25s_ease-out]"
      >
        {src ? (
          <img src={src} alt={alt} className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl" />
        ) : patientId ? (
          <PatientPhotoImg
            patientId={patientId}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl"
            fallback={<span className="text-white">Sem foto</span>}
          />
        ) : null}
      </div>
    </div>
  )
}

function InitialsFallback({ name }: { name: string }) {
  return <span className="text-4xl font-black text-muted-foreground">{initials(name)}</span>
}

function InfoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-[11px] font-medium text-slate-700 dark:text-slate-300">
      {children}
    </span>
  )
}

function SimilarityBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.75
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    : value >= 0.60
      ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider', color)}>
      {pct}% match
    </span>
  )
}
