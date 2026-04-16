import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, UserPlus, AlertCircle, ScanLine, ScanFace, Loader2 } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { FormField } from '../../components/ui/FormField'
import { MaskedInput } from '../../components/ui/MaskedInput'
import { DocumentScannerModal } from './components/DocumentScannerModal'
import { FaceRecognitionModal } from './components/FaceRecognitionModal'
import { PatientPhotoImg } from './components/PatientPhotoImg'
import { HttpError } from '../../api/client'
import { hspApi, type PatientListItem, type PatientLookupParams } from '../../api/hsp'
import { aiApi } from '../../api/ai'
import { toast } from '../../store/toastStore'
import { cnsMask, cpfMask } from '../../lib/masks'
import { validateCns, validateCpf } from '../../lib/validators'
import { calcAge, cn, formatCPF, formatDate, initials } from '../../lib/utils'

type Mode = 'name' | 'cpf' | 'cns' | 'documento'

const TABS: { id: Mode; label: string }[] = [
  { id: 'name',      label: 'Nome + Nascimento' },
  { id: 'cpf',       label: 'CPF' },
  { id: 'cns',       label: 'CNS' },
  { id: 'documento', label: 'Outro documento' },
]

export function HspPatientSearchPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('name')

  // Campos por modo
  const [cpf, setCpf] = useState('')
  const [cns, setCns] = useState('')
  const [documento, setDocumento] = useState('')
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [motherName, setMotherName] = useState('')
  const [fatherName, setFatherName] = useState('')

  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PatientListItem[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [showFace, setShowFace] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const reset = () => {
    setSearched(false)
    setResults([])
  }

  const validate = (): string | null => {
    if (mode === 'cpf') {
      if (!cpf) return 'Informe o CPF.'
      const err = validateCpf(cpf)
      if (err) return err
    }
    if (mode === 'cns') {
      if (!cns) return 'Informe o CNS.'
      const err = validateCns(cns)
      if (err) return err
    }
    if (mode === 'documento' && !documento.trim()) return 'Informe o número do documento.'
    if (mode === 'name' && !name.trim() && !motherName.trim() && !fatherName.trim())
      return 'Informe ao menos um campo (nome ou filiação).'
    return null
  }

  const handleSearch = async () => {
    const err = validate()
    if (err) { toast.error(err); return }

    setLoading(true)
    setSearched(true)
    try {
      const params: PatientLookupParams = {}
      if (mode === 'cpf') params.cpf = cpf
      if (mode === 'cns') params.cns = cns
      if (mode === 'documento') params.documento = documento.trim()
      if (mode === 'name') {
        if (name.trim())       params.name       = name.trim()
        if (birthDate)         params.birthDate  = birthDate
        if (motherName.trim()) params.motherName = motherName.trim()
        if (fatherName.trim()) params.fatherName = fatherName.trim()
      }
      const items = await hspApi.lookup(params)
      setResults(items)
    } catch (e) {
      if (e instanceof HttpError) toast.error(e.message)
      else toast.error('Falha na busca.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const goToNew = () => {
    // Pré-preenche o form rápido com os dados informados.
    const qs = new URLSearchParams()
    if (mode === 'cpf' && cpf) qs.set('cpf', cpf)
    if (mode === 'cns' && cns) qs.set('cns', cns)
    if (mode === 'name') {
      if (name)       qs.set('name', name.trim())
      if (birthDate)  qs.set('birthDate', birthDate)
      if (motherName) qs.set('motherName', motherName.trim())
      if (fatherName) qs.set('fatherName', fatherName.trim())
    }
    navigate(`/hsp/pacientes/novo${qs.toString() ? `?${qs}` : ''}`)
  }

  return (
    <div>
      <PageHeader
        title="Buscar paciente"
        subtitle="Procure antes de cadastrar — evite duplicatas"
        back="/hsp"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted"
              title="Abrir câmera e ler um documento"
            >
              <ScanLine size={14} /> Ler documento
            </button>
            <button
              type="button"
              onClick={() => setShowFace(true)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted"
              title="Identificar paciente pelo rosto"
            >
              <ScanFace size={14} /> Reconhecer rosto
            </button>
          </div>
        }
      />

      {showScanner && (
        <DocumentScannerModal
          onClose={() => setShowScanner(false)}
          onCapture={async dataUrl => {
            setShowScanner(false)
            setExtracting(true)
            try {
              const { output } = await aiApi.extractPatientDocument(
                { imageUrl: dataUrl },
                { moduleCode: 'hsp' },
              )
              // Pré-preenche o form rápido com o que a IA conseguiu ler.
              const qs = new URLSearchParams()
              if (output.cpf) qs.set('cpf', output.cpf)
              if (output.cns) qs.set('cns', output.cns)
              if (output.name) qs.set('name', output.name)
              if (output.socialName) qs.set('socialName', output.socialName)
              if (output.birthDate) qs.set('birthDate', output.birthDate)
              if (output.motherName) qs.set('motherName', output.motherName)
              if (output.fatherName) qs.set('fatherName', output.fatherName)
              const confidence = Math.round((output.confidence ?? 0) * 100)
              toast.success(
                'Documento lido',
                `Tipo detectado: ${output.detectedType ?? 'não identificado'}. Confiança: ${confidence}%. Revise os campos antes de salvar.`,
              )
              navigate(`/hsp/pacientes/novo${qs.toString() ? `?${qs}` : ''}`)
            } catch (e) {
              const msg = e instanceof HttpError ? e.message : 'Falha ao extrair documento.'
              toast.error('IA indisponível', msg)
            } finally {
              setExtracting(false)
            }
          }}
        />
      )}

      {extracting && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-border p-6 flex flex-col items-center gap-3 max-w-xs text-center">
            <Loader2 size={24} className="animate-spin text-primary" />
            <p className="text-sm font-medium">Lendo documento...</p>
            <p className="text-xs text-muted-foreground">
              A IA está extraindo os campos (CPF, RG, nome, nascimento) da imagem capturada.
            </p>
          </div>
        </div>
      )}

      {showFace && (
        <FaceRecognitionModal
          onClose={() => setShowFace(false)}
          onCapture={dataUrl => {
            // TODO: enviar ao backend pra matching via embedding.
            // Por enquanto, só mostra preview pra validar qualidade.
            const w = window.open('')
            w?.document.write(`<img src="${dataUrl}" style="max-width:100%;height:auto">`)
          }}
        />
      )}

      <div className="bg-card rounded-xl border border-border p-6 space-y-5">
        {/* Tabs de modo */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setMode(t.id); reset() }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                mode === t.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Campos por modo */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {mode === 'cpf' && (
            <div className="md:col-span-6">
              <FormField label="CPF" hint="11 dígitos">
                <MaskedInput value={cpf} onChange={v => { setCpf(v); reset() }}
                  mask={cpfMask} placeholder="000.000.000-00" autoFocus />
              </FormField>
            </div>
          )}

          {mode === 'cns' && (
            <div className="md:col-span-6">
              <FormField label="CNS" hint="15 dígitos">
                <MaskedInput value={cns} onChange={v => { setCns(v); reset() }}
                  mask={cnsMask} placeholder="000 0000 0000 0000" autoFocus />
              </FormField>
            </div>
          )}

          {mode === 'documento' && (
            <div className="md:col-span-6">
              <FormField label="Número do documento" hint="RG, CNH, Passaporte, etc.">
                <input
                  value={documento}
                  onChange={e => { setDocumento(e.target.value); reset() }}
                  className={baseInput}
                  autoFocus
                />
              </FormField>
            </div>
          )}

          {mode === 'name' && (
            <>
              <div className="md:col-span-8">
                <FormField label="Nome" hint="Busca parcial; combine com filiação para reduzir homônimos">
                  <input
                    value={name}
                    onChange={e => { setName(e.target.value); reset() }}
                    className={baseInput}
                    autoFocus
                  />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="Data de nascimento" hint="Opcional">
                  <input type="date" value={birthDate}
                    onChange={e => { setBirthDate(e.target.value); reset() }}
                    className={baseInput} />
                </FormField>
              </div>
              <div className="md:col-span-6">
                <FormField label="Nome da mãe" hint="Opcional — busca parcial">
                  <input
                    value={motherName}
                    onChange={e => { setMotherName(e.target.value); reset() }}
                    className={baseInput}
                  />
                </FormField>
              </div>
              <div className="md:col-span-6">
                <FormField label="Nome do pai" hint="Opcional — busca parcial">
                  <input
                    value={fatherName}
                    onChange={e => { setFatherName(e.target.value); reset() }}
                    className={baseInput}
                  />
                </FormField>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-border">
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            <Search size={15} /> {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* Resultados */}
      {searched && !loading && (
        <div className="mt-6">
          {results.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mb-3">
                <AlertCircle size={20} />
              </div>
              <p className="text-sm font-medium">Nenhum paciente encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre um novo paciente com os dados informados.
              </p>
              <button
                onClick={goToNew}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
              >
                <UserPlus size={15} /> Cadastrar como novo paciente
              </button>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm">
                  <span className="font-medium">{results.length}</span>{' '}
                  paciente{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={goToNew}
                  className="flex items-center gap-1 px-3 py-1.5 border border-border text-sm rounded-lg hover:bg-muted"
                >
                  <UserPlus size={13} /> Cadastrar mesmo assim
                </button>
              </div>
              <ul className="divide-y divide-border">
                {results.map(p => (
                  <li key={p.id}
                    onClick={() => navigate(`/hsp/pacientes/${p.id}`)}
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
                      {p.hasPhoto ? (
                        <PatientPhotoImg
                          patientId={p.id}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          fallback={initials(p.socialName || p.name)}
                        />
                      ) : initials(p.socialName || p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{p.socialName || p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Prontuário {p.prontuario}
                        {p.cpf && ` · CPF ${formatCPF(p.cpf)}`}
                        {p.birthDate && ` · ${formatDate(p.birthDate)} (${calcAge(p.birthDate)} anos)`}
                      </p>
                    </div>
                    <ArrowRight size={15} className="text-muted-foreground shrink-0" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const baseInput =
  'text-sm border border-border rounded-lg bg-background px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
