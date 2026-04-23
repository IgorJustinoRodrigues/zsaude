import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Save, Camera, Trash2, Loader2, AlertCircle, ScanFace } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { PhotoCropModal } from '../../components/ui/PhotoCropModal'
import { FaceRecognitionModal } from './components/FaceRecognitionModal'
import { FormField } from '../../components/ui/FormField'
import { MaskedInput } from '../../components/ui/MaskedInput'
import { ComboBox, type ComboBoxOption } from '../../components/ui/ComboBox'
import { DocumentList } from './components/DocumentList'
import { DuplicateBanner } from './components/DuplicateBanner'
import { PatientPhotoImg } from './components/PatientPhotoImg'
import { useDuplicateCheck } from './hooks/useDuplicateCheck'
import { HttpError } from '../../api/client'
import {
  hspApi, PATIENT_BASE_FIELDS, toSubmitPayload, type PatientCreate,
  type PatientDocumentInput, type PatientFormData, type PatientRead,
  type PatientUpdate, type Sex,
} from '../../api/hsp'
import { referenceApi, type RefKind } from '../../api/reference'
import { ibgeApi, type IbgeEstado, type IbgeMunicipio } from '../../api/ibge'
import { fetchCep } from '../../api/viacep'
import { toast } from '../../store/toastStore'
import { confirmDialog } from '../../store/dialogStore'
import { cepMask, cnsMask, cpfMask, phoneMask } from '../../lib/masks'
import {
  validateBirthDate, validateCep, validateCns, validateCpf,
  validateEmail, validatePhone,
} from '../../lib/validators'
import { cn } from '../../lib/utils'

type RefMap = Record<string, Array<{ id: string; codigo: string; descricao: string }>>
type FieldKey = keyof PatientFormData
type Errors = Partial<Record<FieldKey, string | null>>

// ─── Tabs ──────────────────────────────────────────────────────────────────

const TABS = [
  'Identificação', 'Sociodemográfico', 'Endereço', 'Contato',
  'Filiação', 'Foto', 'Observações',
] as const
type Tab = typeof TABS[number]

const FIELDS_BY_TAB: Record<Tab, FieldKey[]> = {
  'Identificação': ['name', 'socialName', 'cpf', 'cns', 'birthDate', 'sex'],
  'Sociodemográfico': [
    'nacionalidadeId', 'naturalidadeUf', 'naturalidadeIbge', 'paisNascimento',
    'racaId', 'etniaId', 'povoTradicionalId', 'estadoCivilId', 'escolaridadeId',
    'religiaoId', 'identidadeGeneroId', 'orientacaoSexualId',
    'ocupacaoLivre', 'situacaoRua', 'frequentaEscola',
    'beneficiarioBolsaFamilia', 'rendaFamiliar',
  ],
  'Endereço': [
    'cep', 'logradouroId', 'endereco', 'numero', 'complemento', 'bairro',
    'uf', 'municipioIbge', 'pais', 'areaMicroarea',
  ],
  'Contato': [
    'phone', 'cellphone', 'phoneRecado', 'email', 'idiomaPreferencial',
  ],
  'Filiação': [
    'motherName', 'motherUnknown', 'fatherName', 'fatherUnknown',
    'responsavelNome', 'responsavelCpf', 'responsavelParentescoId',
    'contatoEmergenciaNome', 'contatoEmergenciaTelefone', 'contatoEmergenciaParentescoId',
  ],
  'Foto': [],
  'Observações': ['observacoes', 'consentimentoLgpd'],
}

// ISO alpha-3 dos países mais usados como endereço residencial no Brasil.
// Pra países fora desta lista, o usuário pode digitar o código manualmente
// no select escolhendo "Outro".
const PAISES: { code: string; nome: string }[] = [
  { code: 'BRA', nome: 'Brasil' },
  { code: 'ARG', nome: 'Argentina' },
  { code: 'URY', nome: 'Uruguai' },
  { code: 'PRY', nome: 'Paraguai' },
  { code: 'BOL', nome: 'Bolívia' },
  { code: 'PER', nome: 'Peru' },
  { code: 'COL', nome: 'Colômbia' },
  { code: 'VEN', nome: 'Venezuela' },
  { code: 'CHL', nome: 'Chile' },
  { code: 'USA', nome: 'Estados Unidos' },
  { code: 'PRT', nome: 'Portugal' },
  { code: 'ESP', nome: 'Espanha' },
  { code: 'ITA', nome: 'Itália' },
  { code: 'FRA', nome: 'França' },
  { code: 'DEU', nome: 'Alemanha' },
  { code: 'GBR', nome: 'Reino Unido' },
  { code: 'JPN', nome: 'Japão' },
  { code: 'CHN', nome: 'China' },
]

const REF_KINDS = [
  'tipos-documento', 'estados-civis', 'escolaridades', 'religioes',
  'tipos-sanguineos', 'povos-tradicionais', 'deficiencias', 'parentescos',
  'orientacoes-sexuais', 'identidades-genero',
  'nacionalidades', 'racas', 'etnias', 'logradouros',
]

const EMPTY: PatientFormData = {
  prontuario: null,
  name: '',
  cpf: '',
  socialName: '',
  cns: null,
  birthDate: null, sex: null,
  naturalidadeIbge: '', naturalidadeUf: '', paisNascimento: '',
  identidadeGeneroId: null, orientacaoSexualId: null,
  nacionalidadeId: null, racaId: null, etniaId: null,
  estadoCivilId: null, escolaridadeId: null, religiaoId: null, povoTradicionalId: null,
  cboId: null, ocupacaoLivre: '',
  situacaoRua: false, frequentaEscola: null, rendaFamiliar: null, beneficiarioBolsaFamilia: false,
  cep: '', logradouroId: null, endereco: '', numero: '', complemento: '',
  bairro: '', municipioIbge: '', uf: '', pais: 'BRA', areaMicroarea: '',
  latitude: null, longitude: null,
  phone: '', cellphone: '', phoneRecado: '', email: '', idiomaPreferencial: 'pt-BR',
  motherName: '', motherUnknown: false, fatherName: null, fatherUnknown: false,
  responsavelNome: '', responsavelCpf: '', responsavelParentescoId: null,
  contatoEmergenciaNome: '', contatoEmergenciaTelefone: '', contatoEmergenciaParentescoId: null,
  tipoSanguineoId: null, alergias: '', temAlergia: false, doencasCronicas: '',
  deficiencias: [], gestante: false, dum: null, fumante: null, etilista: null,
  observacoesClinicas: '',
  planoTipo: 'SUS', convenioNome: '', convenioNumeroCarteirinha: '', convenioValidade: null,
  unidadeSaudeId: null, vinculado: true, observacoes: '', consentimentoLgpd: false,
  documents: [],
}

// ─── Página ────────────────────────────────────────────────────────────────

interface HspPatientFormPageProps {
  /** Quando true, o componente renderiza só o corpo do formulário — sem
   *  PageHeader nem tabs sticky com z-index — pra ser embedado dentro de
   *  outra página (ex.: wizard de atendimento). Após salvar, chama
   *  ``onSaved`` em vez de navegar. */
  embedded?: boolean
  /** Override do patientId — normalmente vem do ``useParams`` mas em
   *  modo embedado o pai pode passar direto. */
  patientId?: string
  onSaved?: (patientId: string) => void
  /** Conteúdo extra injetado após a seção da aba correspondente.
   *  Permite o pai adicionar cards contextuais (ex.: "Outros endereços"
   *  só quando ``Endereço`` está ativo). */
  slotAfterTab?: Partial<Record<Tab, React.ReactNode>>
}

export function HspPatientFormPage({
  embedded = false, patientId: patientIdProp, onSaved, slotAfterTab,
}: HspPatientFormPageProps = {}) {
  const params = useParams()
  const id = patientIdProp ?? params.id
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()
  /** true quando a ficha está sendo aberta via URL do módulo recepção —
   *  ajusta título/back pra o fluxo de atendimento. */
  const inRecFlow = embedded || location.pathname.startsWith('/rec/')

  const [tab, setTab] = useState<Tab>('Identificação')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<PatientFormData>({ ...EMPTY })
  const [documents, setDocuments] = useState<PatientDocumentInput[]>([])
  // Snapshot do estado carregado — usado pra computar diff no submit (evita
  // logs falsos de campos não tocados pelo usuário).
  const initialFormRef = useRef<PatientFormData>({ ...EMPTY })
  const initialDocumentsRef = useRef<PatientDocumentInput[]>([])
  const [patient, setPatient] = useState<PatientRead | null>(null)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [showFaceCapture, setShowFaceCapture] = useState(false)
  const [refs, setRefs] = useState<RefMap>({})

  const [touched, setTouched] = useState<Set<FieldKey>>(new Set())
  const [submitTried, setSubmitTried] = useState(false)

  const [estados, setEstados] = useState<IbgeEstado[]>([])
  const [municipiosResidencia, setMunicipiosResidencia] = useState<IbgeMunicipio[]>([])
  const [municipiosNaturalidade, setMunicipiosNaturalidade] = useState<IbgeMunicipio[]>([])
  const [cepLoading, setCepLoading] = useState(false)

  const setField = useCallback(<K extends FieldKey>(key: K, value: PatientFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setTouched(prev => prev.has(key) ? prev : new Set(prev).add(key))
  }, [])

  // ── Validação ──────────────────────────────────────────────────
  const errors: Errors = useMemo(() => {
    const errs: Errors = {}
    if (!form.name?.trim()) errs.name = 'Nome é obrigatório.'
    // CPF é opcional; só valida se preenchido.
    if (form.cpf) errs.cpf = validateCpf(form.cpf)

    if (form.cns) errs.cns = validateCns(form.cns)
    if (form.email) errs.email = validateEmail(form.email)
    if (form.phone) errs.phone = validatePhone(form.phone)
    if (form.cellphone) errs.cellphone = validatePhone(form.cellphone)
    if (form.phoneRecado) errs.phoneRecado = validatePhone(form.phoneRecado)
    if (form.contatoEmergenciaTelefone)
      errs.contatoEmergenciaTelefone = validatePhone(form.contatoEmergenciaTelefone)
    if (form.responsavelCpf) errs.responsavelCpf = validateCpf(form.responsavelCpf)
    if (form.cep) errs.cep = validateCep(form.cep)
    if (form.birthDate) errs.birthDate = validateBirthDate(form.birthDate)

    if (form.gestante && form.sex && form.sex !== 'F')
      errs.gestante = 'Marcar gestante exige sexo Feminino.'
    if (form.motherUnknown && form.motherName)
      errs.motherName = 'Não deve preencher nome da mãe se marcada como desconhecida.'

    return errs
  }, [form])

  const showError = (key: FieldKey): string | null => {
    if (!submitTried && !touched.has(key)) return null
    return errors[key] ?? null
  }

  const errorsByTab = useMemo<Record<Tab, number>>(() => {
    const out = {} as Record<Tab, number>
    for (const t of TABS) {
      out[t] = FIELDS_BY_TAB[t].reduce((acc, f) => acc + (errors[f] ? 1 : 0), 0)
    }
    return out
  }, [errors])

  // Marca abas com campos importantes vazios. Diferente de erros (que
  // vem de validação após submit), isso sinaliza CADASTRO INCOMPLETO —
  // recepção deve confirmar/preencher. Flags ``motherUnknown`` /
  // ``fatherUnknown`` pulam a checagem correspondente.
  const incompleteByTab = useMemo<Record<Tab, boolean>>(() => {
    const empty = (v: unknown) => v === null || v === undefined || v === '' ||
      (Array.isArray(v) && v.length === 0)
    return {
      'Identificação': empty(form.name) || (empty(form.cpf) && empty(form.cns))
        || empty(form.birthDate) || empty(form.sex),
      'Sociodemográfico': empty(form.racaId) || empty(form.estadoCivilId)
        || empty(form.escolaridadeId) || empty(form.nacionalidadeId)
        || (empty(form.ocupacaoLivre) && empty(form.cboId))
        || form.rendaFamiliar === null || form.rendaFamiliar === undefined,
      'Endereço': empty(form.cep) || empty(form.endereco) || empty(form.numero)
        || empty(form.bairro) || empty(form.uf) || empty(form.municipioIbge),
      'Contato': (empty(form.cellphone) && empty(form.phone)) || empty(form.email),
      'Filiação': (empty(form.motherName) && !form.motherUnknown)
        || (empty(form.fatherName) && !form.fatherUnknown)
        || empty(form.contatoEmergenciaNome)
        || empty(form.contatoEmergenciaTelefone),
      'Foto': false,           // foto não bloqueia cadastro
      'Observações': false,    // totalmente opcional
    }
  }, [form])

  const totalErrors = useMemo(
    () => Object.values(errors).filter(Boolean).length,
    [errors],
  )

  // Checagem de duplicata — ignora o próprio paciente no modo edição.
  const { match: duplicate } = useDuplicateCheck({
    cpf: form.cpf, cns: form.cns, excludeId: id,
  })

  // ── Carregamentos ─────────────────────────────────────────────
  useEffect(() => {
    Promise.all(REF_KINDS.map(kind =>
      referenceApi.list(kind as RefKind, { page: 1, pageSize: 500, active: true })
        .then(res => [kind, res.items] as const)
        .catch(() => [kind, [] as RefMap[string]] as const),
    )).then(pairs => {
      const map: RefMap = {}
      for (const [kind, items] of pairs) map[kind] = items
      setRefs(map)
    })
  }, [])

  useEffect(() => { ibgeApi.listEstados().then(setEstados).catch(() => {}) }, [])

  useEffect(() => {
    if (!form.uf) { setMunicipiosResidencia([]); return }
    ibgeApi.listMunicipios(form.uf).then(setMunicipiosResidencia).catch(() => {})
  }, [form.uf])

  useEffect(() => {
    if (!form.naturalidadeUf) { setMunicipiosNaturalidade([]); return }
    ibgeApi.listMunicipios(form.naturalidadeUf).then(setMunicipiosNaturalidade).catch(() => {})
  }, [form.naturalidadeUf])

  const handleCepBlur = async () => {
    if (form.cep.length !== 8) return
    setCepLoading(true)
    try {
      const addr = await fetchCep(form.cep)
      if (!addr) { toast.warning('CEP não encontrado.'); return }
      setForm(prev => ({
        ...prev,
        endereco: prev.endereco || addr.logradouro,
        complemento: prev.complemento || addr.complemento,
        bairro: prev.bairro || addr.bairro,
        uf: addr.uf || prev.uf,
        municipioIbge: addr.ibge || prev.municipioIbge,
      }))
    } finally {
      setCepLoading(false)
    }
  }

  useEffect(() => {
    if (!isEdit) return
    let alive = true
    hspApi.get(id!).then(p => {
      if (!alive) return
      setPatient(p)
      // Documentos vivem no state separado `documents`. Removemos do spread
      // pra não confundir com PatientFormData (que tem documents: array).
      const { documents: _, ...rest } = p
      void _
      const loaded: PatientFormData = { ...EMPTY, ...rest, documents: [] }
      const loadedDocs: PatientDocumentInput[] = p.documents.map(d => ({
        id: d.id, tipoDocumentoId: d.tipoDocumentoId, tipoCodigo: d.tipoCodigo,
        numero: d.numero, orgaoEmissor: d.orgaoEmissor, ufEmissor: d.ufEmissor,
        paisEmissor: d.paisEmissor, dataEmissao: d.dataEmissao,
        dataValidade: d.dataValidade, observacao: d.observacao,
      }))
      setForm(loaded)
      setDocuments(loadedDocs)
      // Snapshot pra computar diff no submit (objetos clonados pra não
      // referenciar o state mutável do React).
      initialFormRef.current = { ...loaded }
      initialDocumentsRef.current = loadedDocs.map(d => ({ ...d }))
    }).catch(err => {
      if (err instanceof HttpError) toast.error(err.message)
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, isEdit])

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitTried(true)
    if (totalErrors > 0) {
      const firstTabWithError = TABS.find(t => errorsByTab[t] > 0)
      if (firstTabWithError) setTab(firstTabWithError)
      toast.error(`Corrija ${totalErrors} ${totalErrors === 1 ? 'erro' : 'erros'} antes de salvar.`)
      return
    }
    setSaving(true)
    try {
      let saved
      if (isEdit) {
        // Envia só os campos modificados — evita logs falsos de "alterou X"
        // quando o usuário não tocou no campo.
        const changed = diffFields(form, initialFormRef.current)
        const docsChanged = !documentsEqual(documents, initialDocumentsRef.current)
        if (changed.length === 0 && !docsChanged) {
          setSaving(false)
          if (embedded) {
            // Em modo embed, "salvar e avançar" deve avançar mesmo sem
            // mudanças (usuário só quer ir pra próxima etapa).
            onSaved?.(id!)
          } else {
            toast.info('Nada a salvar.')
          }
          return
        }
        const patch: PatientUpdate = {}
        for (const k of changed) {
          // Use record-style assignment — o cast é seguro pois k ∈ FieldKey.
          ;(patch as Record<string, unknown>)[k] = form[k]
        }
        if (docsChanged) patch.documents = documents
        saved = await hspApi.update(id!, patch)
      } else {
        const payload = toSubmitPayload(form, documents) as PatientCreate
        saved = await hspApi.create(payload)
      }
      toast.success(isEdit ? 'Paciente atualizado.' : 'Paciente cadastrado.')
      // Embedado: o pai decide o que fazer (geralmente avançar pro próximo
      // passo do wizard). Standalone no rec: volta pra fila. No hsp: detalhe.
      if (embedded) {
        onSaved?.(saved.id)
      } else {
        navigate(inRecFlow ? '/rec/atendimento' : `/hsp/pacientes/${saved.id}`)
      }
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
      else toast.error('Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const handlePhotoConfirm = async (dataUrl: string) => {
    setShowPhotoModal(false)
    if (!isEdit || !patient) {
      toast.warning('Salve o paciente antes de enviar a foto.')
      return
    }
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' })
      const updated = await hspApi.uploadPhoto(patient.id, file)
      setPatient(updated)
      const status = updated.faceEnrollmentStatus
      if (status === 'ok') {
        toast.success('Foto atualizada', 'Rosto cadastrado no reconhecimento facial.')
      } else if (status === 'no_face') {
        toast.warning('Foto atualizada',
          'Não detectamos rosto nesta imagem — ela não será usada no reconhecimento facial.')
      } else if (status === 'low_quality') {
        toast.warning('Foto atualizada',
          'Qualidade do rosto abaixo do ideal. Tente uma foto com mais luz.')
      } else {
        toast.success('Foto atualizada.')
      }
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
      else toast.error('Falha no upload.')
    }
  }

  const handlePhotoRemove = async () => {
    if (!isEdit || !patient?.currentPhotoId) return
    const ok = await confirmDialog({
      title: 'Remover a foto?',
      message: 'A foto deixa de aparecer no prontuário, mas continua acessível pelo histórico.',
      variant: 'danger',
      confirmLabel: 'Remover foto',
    })
    if (!ok) return
    try {
      await hspApi.removePhoto(patient.id)
      const refreshed = await hspApi.get(patient.id)
      setPatient(refreshed)
      toast.success('Foto removida.')
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
    }
  }

  const refOptions = useCallback((kind: string): ComboBoxOption[] => {
    const items = refs[kind] ?? []
    return items
      .slice()
      .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'))
      .map(r => ({ value: r.id, label: r.descricao, hint: r.codigo, searchText: r.codigo }))
  }, [refs])

  const ufOptions = useMemo<ComboBoxOption[]>(
    () => estados.map(e => ({
      value: e.sigla, label: `${e.sigla} — ${e.nome}`, searchText: e.nome,
    })),
    [estados],
  )

  const municipioOptions = (mun: IbgeMunicipio[]): ComboBoxOption[] =>
    mun.map(m => ({ value: String(m.id), label: m.nome }))

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Carregando...</div>
  }

  return (
    <div className={embedded ? 'space-y-5' : undefined}>
      {!embedded && (
        <PageHeader
        title={inRecFlow
          ? 'Atendimento'
          : isEdit ? 'Editar paciente' : 'Novo paciente'}
        subtitle={inRecFlow
          ? `${patient?.socialName || patient?.name || ''}${patient?.prontuario ? ` · Prontuário ${patient.prontuario}` : ''}`
          : isEdit ? `Prontuário ${patient?.prontuario ?? ''}` : 'Cadastro completo'}
        back={inRecFlow
          ? '/rec/atendimento'
          : isEdit ? `/hsp/pacientes/${id}` : '/hsp/pacientes/buscar'}
        actions={
          <div className="flex items-center gap-3">
            {submitTried && totalErrors > 0 && (
              <span className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <AlertCircle size={13} />
                {totalErrors} erro{totalErrors !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              <Save size={16} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        }
      />
      )}

      {/* Nav de seções — underline tradicional no standalone, pills no
          embedado pra integrar melhor com o card do step.
          Badges: erro de validação (vermelho, após submit) tem prioridade
          sobre aviso de incompleto (triângulo âmbar). */}
      {embedded ? (
        <div className="rounded-xl border border-border bg-card p-1.5 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {TABS.map(t => {
              const active = tab === t
              const hasErr = submitTried && errorsByTab[t] > 0
              const incomplete = !hasErr && incompleteByTab[t]
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  {t}
                  {hasErr && (
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
                      active ? 'bg-white/20 text-white'
                        : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
                    )}>
                      {errorsByTab[t]}
                    </span>
                  )}
                  {incomplete && (
                    <AlertTriangle
                      size={14}
                      className={cn(
                        'shrink-0',
                        active ? 'text-amber-200' : 'text-amber-500',
                      )}
                      aria-label="Dados incompletos"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="border-b border-border mb-6 overflow-x-auto sticky top-0 z-10 bg-background">
          <div className="flex gap-0 min-w-max">
            {TABS.map(t => {
              const hasErr = submitTried && errorsByTab[t] > 0
              const incomplete = !hasErr && incompleteByTab[t]
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2',
                    tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                  {hasErr && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                      {errorsByTab[t]}
                    </span>
                  )}
                  {incomplete && (
                    <AlertTriangle
                      size={14}
                      className="text-amber-500 shrink-0"
                      aria-label="Dados incompletos"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ─────────── Identificação ─────────── */}
      {tab === 'Identificação' && (
        <div className="space-y-5">
          {duplicate && <DuplicateBanner match={duplicate} />}
          <Section title="Dados pessoais">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-7">
                <FormField label="Nome completo" required error={showError('name')}>
                  <input
                    value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    onBlur={() => setTouched(t => new Set(t).add('name'))}
                    className={baseInput(showError('name'))}
                  />
                </FormField>
              </div>
              <div className="md:col-span-5">
                <FormField label="Nome social" hint="Como prefere ser chamado(a)">
                  <input
                    value={form.socialName}
                    onChange={e => setField('socialName', e.target.value)}
                    className={baseInput(null)}
                  />
                </FormField>
              </div>

              <div className="md:col-span-3">
                <FormField label="CPF" error={showError('cpf')} valid={!!form.cpf && !errors.cpf}>
                  <MaskedInput
                    value={form.cpf ?? ''}
                    onChange={v => setField('cpf', v || null)}
                    onBlur={() => setTouched(t => new Set(t).add('cpf'))}
                    mask={cpfMask}
                    invalid={!!showError('cpf')}
                    placeholder="000.000.000-00"
                  />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="CNS" hint="Cartão Nacional de Saúde — 15 dígitos"
                  error={showError('cns')} valid={!!form.cns && !errors.cns}>
                  <MaskedInput
                    value={form.cns ?? ''}
                    onChange={v => setField('cns', v || null)}
                    onBlur={() => setTouched(t => new Set(t).add('cns'))}
                    mask={cnsMask}
                    invalid={!!showError('cns')}
                    placeholder="000 0000 0000 0000"
                  />
                </FormField>
              </div>
              <div className="md:col-span-3">
                <FormField label="Nascimento" error={showError('birthDate')}>
                  <input
                    type="date"
                    value={form.birthDate ?? ''}
                    onChange={e => setField('birthDate', e.target.value || null)}
                    className={baseInput(showError('birthDate'))}
                  />
                </FormField>
              </div>
              <div className="md:col-span-2">
                <FormField label="Sexo">
                  <select
                    value={form.sex ?? ''}
                    onChange={e => setField('sex', (e.target.value || null) as Sex | null)}
                    className={baseInput(null)}
                  >
                    <option value="">—</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="I">Intersexo</option>
                  </select>
                </FormField>
              </div>
            </div>
          </Section>

          <Section title="Documentos" subtitle="Adicione quantos documentos forem necessários (RG, CNH, Passaporte, NIS, Título, CadÚnico, etc.)">
            <DocumentList
              value={documents}
              onChange={setDocuments}
              tiposDocumento={refs['tipos-documento'] ?? []}
            />
          </Section>
        </div>
      )}

      {/* ─────────── Sociodemográfico ─────────── */}
      {tab === 'Sociodemográfico' && (
        <div className="space-y-5">
          <Section title="Origem">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <FormField label="Nacionalidade">
                  <ComboBox value={form.nacionalidadeId} options={refOptions('nacionalidades')}
                    onChange={v => setField('nacionalidadeId', v)} />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="UF de naturalidade">
                  <ComboBox value={form.naturalidadeUf || null} options={ufOptions}
                    onChange={uf => setForm(p => ({
                      ...p, naturalidadeUf: uf ?? '', naturalidadeIbge: '',
                    }))} />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="Município de nascimento"
                  hint={!form.naturalidadeUf ? 'Selecione a UF antes' : undefined}>
                  <ComboBox value={form.naturalidadeIbge || null}
                    options={municipioOptions(municipiosNaturalidade)}
                    onChange={v => setField('naturalidadeIbge', v ?? '')}
                    disabled={!form.naturalidadeUf} />
                </FormField>
              </div>
            </div>
          </Section>

          <Section title="Identidade">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Raça/Cor">
                <ComboBox value={form.racaId} options={refOptions('racas')}
                  onChange={v => setField('racaId', v)} />
              </FormField>
              <FormField label="Etnia (indígena)">
                <ComboBox value={form.etniaId} options={refOptions('etnias')}
                  onChange={v => setField('etniaId', v)} />
              </FormField>
              <FormField label="Povo tradicional">
                <ComboBox value={form.povoTradicionalId} options={refOptions('povos-tradicionais')}
                  onChange={v => setField('povoTradicionalId', v)} />
              </FormField>
              <FormField label="Estado civil">
                <ComboBox value={form.estadoCivilId} options={refOptions('estados-civis')}
                  onChange={v => setField('estadoCivilId', v)} />
              </FormField>
              <FormField label="Religião">
                <ComboBox value={form.religiaoId} options={refOptions('religioes')}
                  onChange={v => setField('religiaoId', v)} />
              </FormField>
              <FormField label="Escolaridade">
                <ComboBox value={form.escolaridadeId} options={refOptions('escolaridades')}
                  onChange={v => setField('escolaridadeId', v)} />
              </FormField>
              <FormField label="Identidade de gênero">
                <ComboBox value={form.identidadeGeneroId} options={refOptions('identidades-genero')}
                  onChange={v => setField('identidadeGeneroId', v)} />
              </FormField>
              <FormField label="Orientação sexual">
                <ComboBox value={form.orientacaoSexualId} options={refOptions('orientacoes-sexuais')}
                  onChange={v => setField('orientacaoSexualId', v)} />
              </FormField>
              <div />
            </div>
          </Section>

          <Section title="Socioeconômico">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Ocupação (livre)">
                <input value={form.ocupacaoLivre} onChange={e => setField('ocupacaoLivre', e.target.value)}
                  className={baseInput(null)} />
              </FormField>
              <FormField label="Renda familiar (R$)">
                <input type="number" min="0" step="0.01" value={form.rendaFamiliar ?? ''}
                  onChange={e => setField('rendaFamiliar', e.target.value ? Number(e.target.value) : null)}
                  className={baseInput(null)} />
              </FormField>
              <div />
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <CheckboxRow label="Em situação de rua" checked={form.situacaoRua}
                onChange={v => setField('situacaoRua', v)} />
              <CheckboxRow label="Frequenta escola" checked={form.frequentaEscola ?? false}
                onChange={v => setField('frequentaEscola', v)} />
              <CheckboxRow label="Beneficiário do Bolsa Família"
                checked={form.beneficiarioBolsaFamilia}
                onChange={v => setField('beneficiarioBolsaFamilia', v)} />
            </div>
          </Section>
        </div>
      )}

      {/* ─────────── Endereço ─────────── */}
      {tab === 'Endereço' && (
        <div className="space-y-5">
          <Section title="Endereço residencial">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-3">
                <FormField label={`CEP${cepLoading ? ' (buscando...)' : ''}`}
                  error={showError('cep')}>
                  <div className="relative">
                    <MaskedInput value={form.cep} onChange={v => setField('cep', v)}
                      onBlur={handleCepBlur}
                      mask={cepMask}
                      invalid={!!showError('cep')}
                      placeholder="00000-000 (Tab busca)"
                    />
                    {cepLoading && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </FormField>
              </div>
              <div className="md:col-span-3">
                <FormField label="Tipo de logradouro">
                  <ComboBox value={form.logradouroId} options={refOptions('logradouros')}
                    onChange={v => setField('logradouroId', v)} />
                </FormField>
              </div>
              <div className="md:col-span-6">
                <FormField label="Endereço">
                  <input value={form.endereco} onChange={e => setField('endereco', e.target.value)}
                    className={baseInput(null)} />
                </FormField>
              </div>

              <div className="md:col-span-2">
                <FormField label="Número">
                  <input value={form.numero} onChange={e => setField('numero', e.target.value)}
                    className={baseInput(null)} />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="Complemento">
                  <input value={form.complemento} onChange={e => setField('complemento', e.target.value)}
                    className={baseInput(null)} />
                </FormField>
              </div>
              <div className="md:col-span-3">
                <FormField label="Bairro">
                  <input value={form.bairro} onChange={e => setField('bairro', e.target.value)}
                    className={baseInput(null)} />
                </FormField>
              </div>
              <div className="md:col-span-3">
                <FormField label="Área/Microárea (eSUS)">
                  <input value={form.areaMicroarea} onChange={e => setField('areaMicroarea', e.target.value)}
                    className={baseInput(null)} />
                </FormField>
              </div>

              <div className="md:col-span-3">
                <FormField label="UF">
                  <ComboBox value={form.uf || null} options={ufOptions}
                    onChange={uf => setForm(p => ({ ...p, uf: uf ?? '', municipioIbge: '' }))} />
                </FormField>
              </div>
              <div className="md:col-span-6">
                <FormField label="Município"
                  hint={!form.uf ? 'Selecione a UF antes' : undefined}>
                  <ComboBox value={form.municipioIbge || null}
                    options={municipioOptions(municipiosResidencia)}
                    onChange={v => setField('municipioIbge', v ?? '')}
                    disabled={!form.uf} />
                </FormField>
              </div>
              <div className="md:col-span-3">
                <FormField label="País">
                  <ComboBox
                    value={form.pais || null}
                    options={PAISES.map(p => ({ value: p.code, label: p.nome, hint: p.code, searchText: p.code }))}
                    onChange={v => setField('pais', v ?? 'BRA')}
                    required
                  />
                </FormField>
              </div>
            </div>

          </Section>
        </div>
      )}

      {/* ─────────── Contato ─────────── */}
      {tab === 'Contato' && (
        <div className="space-y-5">
          <Section
            title="Contato"
            subtitle="Mantenha celular e e-mail sempre atualizados — são os canais de aviso ao paciente."
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <FormField label="Celular" error={showError('cellphone')}>
                  <MaskedInput value={form.cellphone} onChange={v => setField('cellphone', v)}
                    mask={phoneMask} invalid={!!showError('cellphone')} placeholder="(00) 00000-0000" />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="Telefone fixo" error={showError('phone')}>
                  <MaskedInput value={form.phone} onChange={v => setField('phone', v)}
                    mask={phoneMask} invalid={!!showError('phone')} placeholder="(00) 0000-0000" />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="Recado" error={showError('phoneRecado')}>
                  <MaskedInput value={form.phoneRecado} onChange={v => setField('phoneRecado', v)}
                    mask={phoneMask} invalid={!!showError('phoneRecado')} placeholder="(00) 00000-0000" />
                </FormField>
              </div>
              <div className="md:col-span-8">
                <FormField label="E-mail" error={showError('email')}
                  valid={!!form.email && !errors.email}>
                  <input type="email" value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    onBlur={() => setTouched(t => new Set(t).add('email'))}
                    className={baseInput(showError('email'))}
                    placeholder="exemplo@email.com"
                  />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="Idioma preferencial">
                  <input value={form.idiomaPreferencial}
                    onChange={e => setField('idiomaPreferencial', e.target.value)}
                    className={baseInput(null)}
                    placeholder="pt-BR"
                  />
                </FormField>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ─────────── Filiação ─────────── */}
      {tab === 'Filiação' && (
        <div className="space-y-5">
          <Section title="Filiação">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FormField label="Nome da mãe" error={showError('motherName')}>
                  <input value={form.motherName} disabled={form.motherUnknown}
                    onChange={e => setField('motherName', e.target.value)}
                    className={baseInput(showError('motherName'))} />
                </FormField>
                <div className="mt-2">
                  <CheckboxRow label="Mãe desconhecida" checked={form.motherUnknown}
                    onChange={v => {
                      setField('motherUnknown', v)
                      if (v) setField('motherName', '')
                    }} />
                </div>
              </div>
              <div>
                <FormField label="Nome do pai">
                  <input value={form.fatherName ?? ''} disabled={form.fatherUnknown}
                    onChange={e => setField('fatherName', e.target.value || null)}
                    className={baseInput(null)} />
                </FormField>
                <div className="mt-2">
                  <CheckboxRow label="Pai desconhecido" checked={form.fatherUnknown}
                    onChange={v => {
                      setField('fatherUnknown', v)
                      if (v) setField('fatherName', null)
                    }} />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Responsável legal">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <FormField label="Nome">
                  <input value={form.responsavelNome}
                    onChange={e => setField('responsavelNome', e.target.value)}
                    className={baseInput(null)} />
                </FormField>
              </div>
              <div className="md:col-span-3">
                <FormField label="CPF" error={showError('responsavelCpf')}
                  valid={!!form.responsavelCpf && !errors.responsavelCpf}>
                  <MaskedInput value={form.responsavelCpf}
                    onChange={v => setField('responsavelCpf', v)}
                    mask={cpfMask} invalid={!!showError('responsavelCpf')} placeholder="000.000.000-00" />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="Parentesco">
                  <ComboBox value={form.responsavelParentescoId} options={refOptions('parentescos')}
                    onChange={v => setField('responsavelParentescoId', v)} />
                </FormField>
              </div>
            </div>
          </Section>

          <Section title="Contato de emergência" subtitle="Importante em internação">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <FormField label="Nome">
                  <input value={form.contatoEmergenciaNome}
                    onChange={e => setField('contatoEmergenciaNome', e.target.value)}
                    className={baseInput(null)} />
                </FormField>
              </div>
              <div className="md:col-span-3">
                <FormField label="Telefone" error={showError('contatoEmergenciaTelefone')}>
                  <MaskedInput value={form.contatoEmergenciaTelefone}
                    onChange={v => setField('contatoEmergenciaTelefone', v)}
                    mask={phoneMask} invalid={!!showError('contatoEmergenciaTelefone')}
                    placeholder="(00) 00000-0000" />
                </FormField>
              </div>
              <div className="md:col-span-4">
                <FormField label="Parentesco">
                  <ComboBox value={form.contatoEmergenciaParentescoId}
                    options={refOptions('parentescos')}
                    onChange={v => setField('contatoEmergenciaParentescoId', v)} />
                </FormField>
              </div>
            </div>
          </Section>
        </div>
      )}


      {/* ─────────── Foto ─────────── */}
      {tab === 'Foto' && (
        <Section title="Foto do paciente">
          <div className="flex items-start gap-6">
            <div className="w-40 h-40 rounded-full bg-muted/40 border border-border overflow-hidden flex items-center justify-center shrink-0">
              {isEdit && patient?.hasPhoto ? (
                <PatientPhotoImg
                  patientId={patient.id}
                  cacheKey={patient.currentPhotoId ?? undefined}
                  alt="Foto do paciente"
                  className="w-full h-full object-cover"
                  fallback={<Camera size={36} className="text-muted-foreground" />}
                />
              ) : (
                <Camera size={36} className="text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm">
                {isEdit
                  ? 'Você pode enviar uma nova foto a qualquer momento. A foto anterior fica registrada no histórico.'
                  : 'Salve o paciente primeiro para habilitar o envio de foto.'}
              </p>
              <div className="flex gap-2 mt-4 flex-wrap">
                <button type="button" disabled={!isEdit}
                  onClick={() => setShowPhotoModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
                  title="Escolher uma imagem do dispositivo">
                  <Camera size={14} /> Enviar foto
                </button>
                <button type="button" disabled={!isEdit}
                  onClick={() => setShowFaceCapture(true)}
                  className="flex items-center gap-2 px-3 py-2 border border-primary text-primary rounded-lg text-sm hover:bg-primary/10 disabled:opacity-50"
                  title="Usar a câmera — localiza o rosto, recorta automaticamente e já indexa pro reconhecimento">
                  <ScanFace size={14} /> Tirar com câmera
                </button>
                {isEdit && patient?.hasPhoto && (
                  <button type="button" onClick={handlePhotoRemove}
                    className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted">
                    <Trash2 size={14} /> Remover
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Ao tirar pela câmera, o sistema procura o rosto, recorta
                a imagem no melhor enquadramento e já cadastra no
                reconhecimento facial.
              </p>
            </div>
          </div>
          {showPhotoModal && (
            <PhotoCropModal onConfirm={handlePhotoConfirm} onClose={() => setShowPhotoModal(false)} />
          )}
          {showFaceCapture && (
            <FaceRecognitionModal
              mode="enroll"
              onClose={() => setShowFaceCapture(false)}
              onCapture={dataUrl => {
                setShowFaceCapture(false)
                void handlePhotoConfirm(dataUrl)
              }}
            />
          )}
        </Section>
      )}

      {/* ─────────── Observações ─────────── */}
      {tab === 'Observações' && (
        <Section title="Observações gerais e LGPD">
          <FormField label="Observações">
            <textarea rows={5} value={form.observacoes}
              onChange={e => setField('observacoes', e.target.value)}
              className={baseInput(null)} />
          </FormField>
          <div className="mt-4">
            <CheckboxRow
              label="Paciente consentiu com o uso dos dados conforme LGPD"
              checked={form.consentimentoLgpd}
              onChange={v => setField('consentimentoLgpd', v)} />
          </div>
        </Section>
      )}

      {/* Slot contextual — conteúdo injetado pelo pai só quando a aba
          correspondente está ativa (ex.: "Outros endereços" em Endereço). */}
      {slotAfterTab?.[tab] ?? null}

      {/* Botão de salvar no final do form — essencial em modo embedado
          (sem PageHeader) e útil também no modo standalone pra quem rolou
          até o final. */}
      <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-border">
        {submitTried && totalErrors > 0 && (
          <span className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
            <AlertCircle size={13} />
            {totalErrors} erro{totalErrors !== 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          <Save size={16} /> {saving ? 'Salvando…' : (embedded ? 'Salvar e avançar' : 'Salvar')}
        </button>
      </div>
    </div>
  )
}

// ─── Helpers de diff ──────────────────────────────────────────────────────

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0)

const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (isEmpty(a) && isEmpty(b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((x, i) => x === b[i])
  }
  return a === b
}

/** Retorna a lista de campos do form que diferem do snapshot inicial. */
function diffFields(current: PatientFormData, initial: PatientFormData): FieldKey[] {
  const out: FieldKey[] = []
  for (const k of PATIENT_BASE_FIELDS) {
    if (!valuesEqual(current[k], initial[k])) out.push(k)
  }
  return out
}

/** Compara duas listas de documentos por valor (ordem importa pois reflete UI). */
function documentsEqual(a: PatientDocumentInput[], b: PatientDocumentInput[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]; const y = b[i]
    if (x.id !== y.id) return false
    if (!valuesEqual(x.tipoDocumentoId, y.tipoDocumentoId)) return false
    if (!valuesEqual(x.tipoCodigo, y.tipoCodigo)) return false
    if (!valuesEqual(x.numero, y.numero)) return false
    if (!valuesEqual(x.orgaoEmissor, y.orgaoEmissor)) return false
    if (!valuesEqual(x.ufEmissor, y.ufEmissor)) return false
    if (!valuesEqual(x.paisEmissor, y.paisEmissor)) return false
    if (!valuesEqual(x.dataEmissao, y.dataEmissao)) return false
    if (!valuesEqual(x.dataValidade, y.dataValidade)) return false
    if (!valuesEqual(x.observacao, y.observacao)) return false
  }
  return true
}

// ─── Mini-componentes ──────────────────────────────────────────────────────

function Section({ title, subtitle, children }: {
  title?: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      {title && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function baseInput(error: string | null | undefined) {
  return cn(
    'text-sm border rounded-lg bg-background px-3 py-2 w-full focus:outline-none focus:ring-2',
    error
      ? 'border-rose-300 dark:border-rose-800 focus:ring-rose-200 dark:focus:ring-rose-900 focus:border-rose-400'
      : 'border-border focus:ring-primary/20 focus:border-primary',
    'disabled:bg-muted/40 disabled:text-muted-foreground',
  )
}

function CheckboxRow({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function TriCheckbox({ label, value, onChange }: {
  label: string; value: boolean | null; onChange: (v: boolean | null) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">{label}:</span>
      {([
        [null, 'N/I'],
        [true, 'Sim'],
        [false, 'Não'],
      ] as const).map(([v, lbl]) => (
        <label key={String(v)} className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="radio" checked={value === v}
            onChange={() => onChange(v)} />
          {lbl}
        </label>
      ))}
    </div>
  )
}
