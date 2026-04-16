import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, Camera, Trash2, Loader2 } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { PhotoCropModal } from '../../components/ui/PhotoCropModal'
import { HttpError } from '../../api/client'
import {
  hspApi, type PatientCreate, type PatientRead, type PatientUpdate,
  type PlanoSaudeTipo, type Sex,
} from '../../api/hsp'
import { referenceApi, type RefKind } from '../../api/reference'
import { ibgeApi, type IbgeEstado, type IbgeMunicipio } from '../../api/ibge'
import { fetchCep } from '../../api/viacep'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

type RefMap = Record<string, Array<{ id: string; codigo: string; descricao: string }>>

const TABS = [
  'Identificação',
  'Sociodemográfico',
  'Endereço',
  'Filiação',
  'Clínico',
  'Convênio',
  'Foto',
  'Observações',
] as const
type Tab = typeof TABS[number]

// Slugs da API de referência — string bruta, o backend aceita nós.
const REF_KINDS = [
  'tipos-documento', 'estados-civis', 'escolaridades', 'religioes',
  'tipos-sanguineos', 'povos-tradicionais', 'deficiencias', 'parentescos',
  'orientacoes-sexuais', 'identidades-genero',
  'nacionalidades', 'racas', 'etnias', 'logradouros',
]

function maskCpf(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
}
function maskPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
}
function maskCep(v: string) {
  return v.replace(/\D/g, '').slice(0, 8)
}

const EMPTY: PatientCreate = {
  name: '',
  cpf: '',
  socialName: '',
  cns: null, rg: '', rgOrgaoEmissor: '', rgUf: '', rgDataEmissao: null,
  tipoDocumentoId: null, numeroDocumento: '',
  passaporte: '', paisPassaporte: '', nisPis: '', tituloEleitor: '', cadunico: '',
  birthDate: null, sex: null,
  naturalidadeIbge: '', naturalidadeUf: '', paisNascimento: '',
  identidadeGeneroId: null, orientacaoSexualId: null,
  nacionalidadeId: null, racaId: null, etniaId: null,
  estadoCivilId: null, escolaridadeId: null, religiaoId: null, povoTradicionalId: null,
  cboId: null, ocupacaoLivre: '',
  situacaoRua: false, frequentaEscola: null, rendaFamiliar: null, beneficiarioBolsaFamilia: false,
  cep: '', logradouroId: null, endereco: '', numero: '', complemento: '',
  bairro: '', municipioIbge: '', uf: '', pais: 'BRA', areaMicroarea: '',
  phone: '', cellphone: '', phoneRecado: '', email: '', idiomaPreferencial: 'pt-BR',
  motherName: '', motherUnknown: false, fatherName: null, fatherUnknown: false,
  responsavelNome: '', responsavelCpf: '', responsavelParentescoId: null,
  contatoEmergenciaNome: '', contatoEmergenciaTelefone: '', contatoEmergenciaParentescoId: null,
  tipoSanguineoId: null, alergias: '', temAlergia: false, doencasCronicas: '',
  deficiencias: [], gestante: false, dum: null, fumante: null, etilista: null,
  observacoesClinicas: '',
  planoTipo: 'SUS', convenioNome: '', convenioNumeroCarteirinha: '', convenioValidade: null,
  unidadeSaudeId: null, vinculado: true, observacoes: '', consentimentoLgpd: false,
}

export function HspPatientFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Identificação')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<PatientCreate>({ ...EMPTY })
  const [patient, setPatient] = useState<PatientRead | null>(null)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [refs, setRefs] = useState<RefMap>({})

  // IBGE
  const [estados, setEstados] = useState<IbgeEstado[]>([])
  const [municipiosResidencia, setMunicipiosResidencia] = useState<IbgeMunicipio[]>([])
  const [municipiosNaturalidade, setMunicipiosNaturalidade] = useState<IbgeMunicipio[]>([])
  const [cepLoading, setCepLoading] = useState(false)

  const setField = <K extends keyof PatientCreate>(key: K, value: PatientCreate[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // ── Carrega refs (todas de uma vez, page_size grande) ─────────
  useEffect(() => {
    Promise.all(REF_KINDS.map(kind =>
      referenceApi.list(kind as RefKind, { page: 1, pageSize: 500, active: true })
        .then(res => [kind, res.items] as const)
        .catch(() => [kind, [] as RefMap[string]] as const),
    )).then(pairs => {
      const map: RefMap = {}
      for (const [kind, items] of pairs) {
        map[kind] = items
      }
      setRefs(map)
    })
  }, [])

  // ── Carrega estados IBGE (uma vez) ────────────────────────────
  useEffect(() => {
    ibgeApi.listEstados().then(setEstados).catch(() => {})
  }, [])

  // ── Carrega municípios quando a UF muda ───────────────────────
  useEffect(() => {
    if (!form.uf) { setMunicipiosResidencia([]); return }
    ibgeApi.listMunicipios(form.uf).then(setMunicipiosResidencia).catch(() => {})
  }, [form.uf])

  useEffect(() => {
    if (!form.naturalidadeUf) { setMunicipiosNaturalidade([]); return }
    ibgeApi.listMunicipios(form.naturalidadeUf).then(setMunicipiosNaturalidade).catch(() => {})
  }, [form.naturalidadeUf])

  // ── Autofill por CEP ──────────────────────────────────────────
  const handleCepBlur = async () => {
    if (form.cep.length !== 8) return
    setCepLoading(true)
    try {
      const addr = await fetchCep(form.cep)
      if (!addr) {
        toast.warning('CEP não encontrado.')
        return
      }
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

  // ── Carrega paciente (edit) ───────────────────────────────────
  useEffect(() => {
    if (!isEdit) return
    let alive = true
    hspApi.get(id!).then(p => {
      if (!alive) return
      setPatient(p)
      setForm({
        ...EMPTY,
        ...p,
      })
    }).catch(err => {
      if (err instanceof HttpError) toast.error(err.message)
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, isEdit])

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name || !form.cpf) {
      toast.error('Nome e CPF são obrigatórios.')
      setTab('Identificação')
      return
    }
    if (form.cpf.length !== 11) {
      toast.error('CPF deve ter 11 dígitos.')
      return
    }
    setSaving(true)
    try {
      const saved = isEdit
        ? await hspApi.update(id!, form as PatientUpdate)
        : await hspApi.create(form)
      toast.success(isEdit ? 'Paciente atualizado.' : 'Paciente cadastrado.')
      navigate(`/hsp/pacientes/${saved.id}`)
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
      toast.success('Foto atualizada.')
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
      else toast.error('Falha no upload.')
    }
  }

  const handlePhotoRemove = async () => {
    if (!isEdit || !patient?.currentPhotoId) return
    if (!confirm('Remover a foto do paciente?')) return
    try {
      await hspApi.removePhoto(patient.id)
      const refreshed = await hspApi.get(patient.id)
      setPatient(refreshed)
      toast.success('Foto removida.')
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Carregando...</div>
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Editar paciente' : 'Novo paciente'}
        subtitle={isEdit ? `Prontuário ${patient?.prontuario ?? ''}` : 'Cadastro completo'}
        back={isEdit ? `/hsp/pacientes/${id}` : '/hsp/pacientes'}
        actions={
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        }
      />

      {/* Tabs */}
      <div className="border-b border-border mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Painéis */}
      {tab === 'Identificação' && (
        <Section>
          <Grid>
            <Input label="Nome completo *" value={form.name} onChange={v => setField('name', v)} />
            <Input label="Nome social" value={form.socialName} onChange={v => setField('socialName', v)} />
            <Input label="CPF *" value={form.cpf} onChange={v => setField('cpf', maskCpf(v))} maxLength={11} />
            <Input label="CNS" value={form.cns ?? ''} onChange={v => setField('cns', v || null)} maxLength={15} />
            <DateInput label="Nascimento" value={form.birthDate} onChange={v => setField('birthDate', v)} />
            <Select label="Sexo" value={form.sex ?? ''} onChange={v => setField('sex', (v || null) as Sex | null)}
              options={[['', '—'], ['M', 'Masculino'], ['F', 'Feminino'], ['I', 'Intersexo/Indeterminado']]} />

            <Input label="RG" value={form.rg} onChange={v => setField('rg', v)} />
            <Input label="Órgão emissor" value={form.rgOrgaoEmissor} onChange={v => setField('rgOrgaoEmissor', v)} />
            <Input label="UF emissor" value={form.rgUf} onChange={v => setField('rgUf', v.toUpperCase().slice(0, 2))} />
            <DateInput label="Emissão RG" value={form.rgDataEmissao} onChange={v => setField('rgDataEmissao', v)} />

            <RefSelect label="Tipo documento" value={form.tipoDocumentoId} refs={refs['tipos-documento']}
              onChange={v => setField('tipoDocumentoId', v)} />
            <Input label="Número documento" value={form.numeroDocumento} onChange={v => setField('numeroDocumento', v)} />
            <Input label="Passaporte" value={form.passaporte} onChange={v => setField('passaporte', v)} />
            <Input label="País passaporte (ISO)" value={form.paisPassaporte} onChange={v => setField('paisPassaporte', v.toUpperCase())} maxLength={3} />

            <Input label="NIS/PIS" value={form.nisPis} onChange={v => setField('nisPis', v)} maxLength={15} />
            <Input label="Título eleitor" value={form.tituloEleitor} onChange={v => setField('tituloEleitor', v)} maxLength={15} />
            <Input label="CadÚnico" value={form.cadunico} onChange={v => setField('cadunico', v)} maxLength={15} />
          </Grid>
        </Section>
      )}

      {tab === 'Sociodemográfico' && (
        <Section>
          <Grid>
            <RefSelect label="Nacionalidade" value={form.nacionalidadeId} refs={refs['nacionalidades']}
              onChange={v => setField('nacionalidadeId', v)} />
            <UfSelect label="UF de naturalidade" value={form.naturalidadeUf} estados={estados}
              onChange={uf => setForm(prev => ({ ...prev, naturalidadeUf: uf, naturalidadeIbge: '' }))} />
            <MunicipioSelect label="Município de nascimento" value={form.naturalidadeIbge}
              municipios={municipiosNaturalidade}
              onChange={v => setField('naturalidadeIbge', v)} />
            <Input label="País nascimento (ISO)" value={form.paisNascimento} onChange={v => setField('paisNascimento', v.toUpperCase())} maxLength={3} />

            <RefSelect label="Raça/Cor" value={form.racaId} refs={refs['racas']}
              onChange={v => setField('racaId', v)} />
            <RefSelect label="Etnia (indígena)" value={form.etniaId} refs={refs['etnias']}
              onChange={v => setField('etniaId', v)} />
            <RefSelect label="Povo tradicional" value={form.povoTradicionalId} refs={refs['povos-tradicionais']}
              onChange={v => setField('povoTradicionalId', v)} />
            <RefSelect label="Estado civil" value={form.estadoCivilId} refs={refs['estados-civis']}
              onChange={v => setField('estadoCivilId', v)} />
            <RefSelect label="Escolaridade" value={form.escolaridadeId} refs={refs['escolaridades']}
              onChange={v => setField('escolaridadeId', v)} />
            <RefSelect label="Religião" value={form.religiaoId} refs={refs['religioes']}
              onChange={v => setField('religiaoId', v)} />
            <RefSelect label="Identidade de gênero" value={form.identidadeGeneroId} refs={refs['identidades-genero']}
              onChange={v => setField('identidadeGeneroId', v)} />
            <RefSelect label="Orientação sexual" value={form.orientacaoSexualId} refs={refs['orientacoes-sexuais']}
              onChange={v => setField('orientacaoSexualId', v)} />

            <Input label="Ocupação (livre)" value={form.ocupacaoLivre} onChange={v => setField('ocupacaoLivre', v)} />

            <Checkbox label="Em situação de rua" checked={form.situacaoRua} onChange={v => setField('situacaoRua', v)} />
            <Checkbox label="Frequenta escola" checked={form.frequentaEscola ?? false} onChange={v => setField('frequentaEscola', v)} />
            <Checkbox label="Beneficiário Bolsa Família" checked={form.beneficiarioBolsaFamilia} onChange={v => setField('beneficiarioBolsaFamilia', v)} />
            <NumberInput label="Renda familiar (R$)" value={form.rendaFamiliar} onChange={v => setField('rendaFamiliar', v)} />
          </Grid>
        </Section>
      )}

      {tab === 'Endereço' && (
        <Section>
          <Grid>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                CEP {cepLoading && <Loader2 size={10} className="inline animate-spin ml-1" />}
              </span>
              <input
                value={form.cep}
                onChange={e => setField('cep', maskCep(e.target.value))}
                onBlur={handleCepBlur}
                maxLength={8}
                placeholder="Só números (00000000)"
                className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </label>
            <RefSelect label="Tipo de logradouro" value={form.logradouroId} refs={refs['logradouros']}
              onChange={v => setField('logradouroId', v)} />
            <Input label="Endereço" value={form.endereco} onChange={v => setField('endereco', v)} />
            <Input label="Número" value={form.numero} onChange={v => setField('numero', v)} />
            <Input label="Complemento" value={form.complemento} onChange={v => setField('complemento', v)} />
            <Input label="Bairro" value={form.bairro} onChange={v => setField('bairro', v)} />
            <UfSelect label="UF (residência)" value={form.uf} estados={estados}
              onChange={uf => setForm(prev => ({ ...prev, uf, municipioIbge: '' }))} />
            <MunicipioSelect label="Município" value={form.municipioIbge} municipios={municipiosResidencia}
              onChange={v => setField('municipioIbge', v)} />
            <Input label="País (ISO)" value={form.pais} onChange={v => setField('pais', v.toUpperCase())} maxLength={3} />
            <Input label="Área/Microárea" value={form.areaMicroarea} onChange={v => setField('areaMicroarea', v)} />
          </Grid>

          <h3 className="text-sm font-semibold mt-6 mb-3">Contato</h3>
          <Grid>
            <Input label="Telefone residencial" value={form.phone} onChange={v => setField('phone', maskPhone(v))} />
            <Input label="Celular" value={form.cellphone} onChange={v => setField('cellphone', maskPhone(v))} />
            <Input label="Telefone recado" value={form.phoneRecado} onChange={v => setField('phoneRecado', maskPhone(v))} />
            <Input label="E-mail" value={form.email} onChange={v => setField('email', v)} />
            <Input label="Idioma preferencial" value={form.idiomaPreferencial} onChange={v => setField('idiomaPreferencial', v)} />
          </Grid>
        </Section>
      )}

      {tab === 'Filiação' && (
        <Section>
          <h3 className="text-sm font-semibold mb-3">Filiação</h3>
          <Grid>
            <Input label="Nome da mãe" value={form.motherName} onChange={v => setField('motherName', v)} disabled={form.motherUnknown} />
            <Checkbox label="Mãe desconhecida" checked={form.motherUnknown} onChange={v => setField('motherUnknown', v)} />
            <Input label="Nome do pai" value={form.fatherName ?? ''} onChange={v => setField('fatherName', v || null)} disabled={form.fatherUnknown} />
            <Checkbox label="Pai desconhecido" checked={form.fatherUnknown} onChange={v => setField('fatherUnknown', v)} />
          </Grid>

          <h3 className="text-sm font-semibold mt-6 mb-3">Responsável</h3>
          <Grid>
            <Input label="Nome" value={form.responsavelNome} onChange={v => setField('responsavelNome', v)} />
            <Input label="CPF" value={form.responsavelCpf} onChange={v => setField('responsavelCpf', maskCpf(v))} maxLength={11} />
            <RefSelect label="Parentesco" value={form.responsavelParentescoId} refs={refs['parentescos']}
              onChange={v => setField('responsavelParentescoId', v)} />
          </Grid>

          <h3 className="text-sm font-semibold mt-6 mb-3">Contato de emergência</h3>
          <Grid>
            <Input label="Nome" value={form.contatoEmergenciaNome} onChange={v => setField('contatoEmergenciaNome', v)} />
            <Input label="Telefone" value={form.contatoEmergenciaTelefone} onChange={v => setField('contatoEmergenciaTelefone', maskPhone(v))} />
            <RefSelect label="Parentesco" value={form.contatoEmergenciaParentescoId} refs={refs['parentescos']}
              onChange={v => setField('contatoEmergenciaParentescoId', v)} />
          </Grid>
        </Section>
      )}

      {tab === 'Clínico' && (
        <Section>
          <Grid>
            <RefSelect label="Tipo sanguíneo" value={form.tipoSanguineoId} refs={refs['tipos-sanguineos']}
              onChange={v => setField('tipoSanguineoId', v)} />
            <Checkbox label="Paciente alérgico" checked={form.temAlergia} onChange={v => setField('temAlergia', v)} />
            <Checkbox label="Gestante" checked={form.gestante} onChange={v => setField('gestante', v)} />
            <DateInput label="Data última menstruação" value={form.dum} onChange={v => setField('dum', v)} />
            <Checkbox label="Fumante" checked={form.fumante ?? false} onChange={v => setField('fumante', v)} />
            <Checkbox label="Etilista" checked={form.etilista ?? false} onChange={v => setField('etilista', v)} />
          </Grid>

          <Textarea label="Alergias (descrição)" value={form.alergias} onChange={v => setField('alergias', v)} />
          <Textarea label="Doenças crônicas" value={form.doencasCronicas} onChange={v => setField('doencasCronicas', v)} />

          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground">Deficiências</label>
            <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-2">
              {(refs['deficiencias'] ?? []).map(r => {
                const checked = form.deficiencias.includes(r.id)
                return (
                  <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...form.deficiencias, r.id]
                          : form.deficiencias.filter(x => x !== r.id)
                        setField('deficiencias', next)
                      }}
                    />
                    {r.descricao}
                  </label>
                )
              })}
            </div>
          </div>

          <Textarea label="Observações clínicas" value={form.observacoesClinicas} onChange={v => setField('observacoesClinicas', v)} />
        </Section>
      )}

      {tab === 'Convênio' && (
        <Section>
          <Grid>
            <Select label="Tipo" value={form.planoTipo} onChange={v => setField('planoTipo', v as PlanoSaudeTipo)}
              options={[['SUS', 'SUS'], ['PARTICULAR', 'Particular'], ['CONVENIO', 'Convênio']]} />
            <Input label="Nome do convênio" value={form.convenioNome} onChange={v => setField('convenioNome', v)} />
            <Input label="Nº carteirinha" value={form.convenioNumeroCarteirinha} onChange={v => setField('convenioNumeroCarteirinha', v)} />
            <DateInput label="Validade" value={form.convenioValidade} onChange={v => setField('convenioValidade', v)} />
          </Grid>
        </Section>
      )}

      {tab === 'Foto' && (
        <Section>
          <div className="flex items-start gap-6">
            <div className="w-40 h-40 rounded-full bg-muted/40 border border-border overflow-hidden flex items-center justify-center shrink-0">
              {isEdit && patient?.hasPhoto ? (
                <img
                  src={hspApi.photoUrl(patient.id)}
                  alt="Foto do paciente"
                  className="w-full h-full object-cover"
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
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  disabled={!isEdit}
                  onClick={() => setShowPhotoModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
                >
                  <Camera size={14} /> Enviar foto
                </button>
                {isEdit && patient?.hasPhoto && (
                  <button
                    type="button"
                    onClick={handlePhotoRemove}
                    className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted"
                  >
                    <Trash2 size={14} /> Remover
                  </button>
                )}
              </div>
            </div>
          </div>
          {showPhotoModal && (
            <PhotoCropModal onConfirm={handlePhotoConfirm} onClose={() => setShowPhotoModal(false)} />
          )}
        </Section>
      )}

      {tab === 'Observações' && (
        <Section>
          <Textarea label="Observações gerais" value={form.observacoes} onChange={v => setField('observacoes', v)} />
          <Checkbox
            label="Paciente consentiu com o uso dos dados conforme LGPD"
            checked={form.consentimentoLgpd}
            onChange={v => setField('consentimentoLgpd', v)}
          />
        </Section>
      )}
    </div>
  )
}

// ─── Mini-componentes ──────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border border-border p-5">{children}</div>
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
}

interface InputProps {
  label: string
  value: string
  onChange: (v: string) => void
  maxLength?: number
  disabled?: boolean
}
function Input({ label, value, onChange, maxLength, disabled }: InputProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        maxLength={maxLength}
        disabled={disabled}
        className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-muted/40 disabled:text-muted-foreground"
      />
    </label>
  )
}

function NumberInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
    </label>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
    </label>
  )
}

interface SelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}
function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

interface RefSelectProps {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  refs: Array<{ id: string; codigo: string; descricao: string }> | undefined
}
function RefSelect({ label, value, onChange, refs }: RefSelectProps) {
  const sorted = useMemo(
    () => (refs ?? []).slice().sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')),
    [refs],
  )
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      >
        <option value="">—</option>
        {sorted.map(r => (
          <option key={r.id} value={r.id}>{r.descricao}</option>
        ))}
      </select>
    </label>
  )
}

function UfSelect({ label, value, estados, onChange }: {
  label: string; value: string; estados: IbgeEstado[]; onChange: (uf: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      >
        <option value="">—</option>
        {estados.map(e => (
          <option key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</option>
        ))}
      </select>
    </label>
  )
}

function MunicipioSelect({ label, value, municipios, onChange }: {
  label: string; value: string; municipios: IbgeMunicipio[]; onChange: (ibge: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={municipios.length === 0}
        className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-muted/40 disabled:text-muted-foreground"
      >
        <option value="">{municipios.length === 0 ? 'Selecione a UF primeiro' : '—'}</option>
        {municipios.map(m => (
          <option key={m.id} value={String(m.id)}>{m.nome}</option>
        ))}
      </select>
    </label>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm pt-6">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 mt-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={3}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
    </label>
  )
}
