// Localiza um cidadão cadastrado e inicia um atendimento direto do balcão,
// sem precisar do totem. Reusa patterns de HspPatientSearchPage (lookup
// multi-critério + reconhecimento facial).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, ScanFace, Search,
  Star, UserPlus,
} from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { MaskedInput } from '../../components/ui/MaskedInput'
import { FormField } from '../../components/ui/FormField'
import { cpfMask, cnsMask } from '../../lib/masks'
import { FaceRecognitionModal } from '../hsp/components/FaceRecognitionModal'
import { PatientPhotoImg } from '../hsp/components/PatientPhotoImg'
import { hspApi, type PatientListItem } from '../../api/hsp'
import { recApi } from '../../api/rec'
import type { MatchCandidate } from '../../api/face'
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

  // Campos dos modos
  const [cpf, setCpf] = useState('')
  const [cns, setCns] = useState('')
  const [name, setName] = useState('')
  const [birth, setBirth] = useState('')
  const [mother, setMother] = useState('')

  const canSearchDoc = cpf.replace(/\D/g, '').length === 11 || cns.replace(/\D/g, '').length === 15
  const canSearchPersonal = name.trim().length >= 3 && (birth || mother.trim().length >= 3)

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
      navigate('/rec/atendimento')
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 409 && typeof err.details?.existingTicket === 'string') {
          toast.warning(
            'Paciente já na fila',
            `Senha existente: ${err.details.existingTicket}`,
          )
        } else {
          toast.error('Falha', err.message)
        }
      }
    } finally {
      setEmitting(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo atendimento"
        subtitle="Localize o cidadão e inicie o atendimento no balcão."
        back="/rec/atendimento"
      />

      {/* Seletor de modo */}
      <div className="mb-5 inline-flex rounded-lg p-1 bg-slate-100 dark:bg-slate-800">
        <TabButton active={mode === 'doc'} onClick={() => setMode('doc')}>
          <Search size={14} /> CPF / CNS
        </TabButton>
        <TabButton active={mode === 'personal'} onClick={() => setMode('personal')}>
          <UserPlus size={14} /> Nome / nascimento / mãe
        </TabButton>
        <TabButton active={mode === 'face'} onClick={() => setMode('face')}>
          <ScanFace size={14} /> Reconhecimento facial
        </TabButton>
      </div>

      {/* Form por modo */}
      {mode === 'doc' && (
        <section className="bg-card rounded-xl border border-border p-4 mb-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="CPF">
              <MaskedInput
                mask={cpfMask}
                value={cpf}
                onChange={setCpf}
                placeholder="000.000.000-00"
              />
            </FormField>
            <FormField label="CNS">
              <MaskedInput
                mask={cnsMask}
                value={cns}
                onChange={setCns}
                placeholder="000 0000 0000 0000"
              />
            </FormField>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={() => search('doc')}
              disabled={!canSearchDoc || searching}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>
        </section>
      )}

      {mode === 'personal' && (
        <section className="bg-card rounded-xl border border-border p-4 mb-4 max-w-2xl">
          <div className="grid grid-cols-1 gap-3">
            <FormField label="Nome completo">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome como está no cadastro"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Data de nascimento">
                <input
                  type="date"
                  value={birth}
                  onChange={e => setBirth(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </FormField>
              <FormField label="Nome da mãe">
                <input
                  type="text"
                  value={mother}
                  onChange={e => setMother(e.target.value)}
                  placeholder="Ajuda a desambiguar homônimos"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </FormField>
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={() => search('personal')}
              disabled={!canSearchPersonal || searching}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Informe o nome + (data de nascimento OU nome da mãe) pra filtrar melhor.
          </p>
        </section>
      )}

      {mode === 'face' && (
        <section className="bg-card rounded-xl border border-border p-4 mb-4 max-w-2xl text-center">
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
              onMatched={cands => {
                setFaceCandidates(cands)
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
          <ul className="space-y-2 max-w-2xl">
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

      {/* Resultados do match facial */}
      {faceCandidates && faceCandidates.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200">
            {faceCandidates.length} candidato{faceCandidates.length === 1 ? '' : 's'} pelo rosto
          </h3>
          <ul className="space-y-2 max-w-2xl">
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
                onStart={priority => startAttendance(
                  c.patientId, c.socialName || c.name, priority,
                )}
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

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
        active
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
      )}
    >
      {children}
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
