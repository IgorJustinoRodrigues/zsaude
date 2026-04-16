import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Edit, History, User2, Trash2 } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { HttpError } from '../../api/client'
import { hspApi, type PatientFieldHistoryItem, type PatientRead } from '../../api/hsp'
import { PatientPhotoImg } from './components/PatientPhotoImg'
import { toast } from '../../store/toastStore'
import { formatCPF, formatDate, formatDateTime, calcAge, initials, cn } from '../../lib/utils'

const TABS = ['Dados', 'Histórico'] as const
type Tab = typeof TABS[number]

export function HspPatientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Dados')
  const [loading, setLoading] = useState(true)
  const [patient, setPatient] = useState<PatientRead | null>(null)
  const [history, setHistory] = useState<PatientFieldHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyField, setHistoryField] = useState('')

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const p = await hspApi.get(id)
      setPatient(p)
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void reload() }, [reload])

  const reloadHistory = useCallback(async () => {
    if (!id) return
    setHistoryLoading(true)
    try {
      const res = await hspApi.listHistory(id, {
        field: historyField || undefined, page: 1, pageSize: 100,
      })
      setHistory(res.items)
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }, [id, historyField])

  useEffect(() => {
    if (tab !== 'Histórico') return
    void reloadHistory()
  }, [tab, reloadHistory])

  const handleDeactivate = async () => {
    if (!patient) return
    const reason = prompt('Motivo da desativação (opcional):') ?? undefined
    if (reason === null) return
    try {
      await hspApi.remove(patient.id, reason || undefined)
      toast.success('Paciente desativado.')
      navigate('/hsp/pacientes/buscar')
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
    }
  }

  const fieldOptions = useMemo(
    () => Array.from(new Set(history.map(h => h.fieldName))).sort(),
    [history],
  )

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Carregando...</div>
  }
  if (!patient) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Paciente não encontrado.</div>
  }

  return (
    <div>
      <PageHeader
        title={patient.socialName || patient.name}
        subtitle={`Prontuário ${patient.prontuario}${patient.cpf ? ` · CPF ${formatCPF(patient.cpf)}` : ''}`}
        back="/hsp/pacientes/buscar"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/hsp/pacientes/${patient.id}/editar`)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted"
            >
              <Edit size={14} /> Editar
            </button>
            {patient.active && (
              <button
                onClick={handleDeactivate}
                className="flex items-center gap-2 px-3 py-2 border border-rose-200 text-rose-600 rounded-lg text-sm hover:bg-rose-50"
              >
                <Trash2 size={14} /> Desativar
              </button>
            )}
          </div>
        }
      />

      {/* Header card */}
      <div className="bg-white rounded-xl border border-border p-5 mb-6 flex items-start gap-5">
        <div className="w-20 h-20 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden">
          {patient.hasPhoto ? (
            <PatientPhotoImg
              patientId={patient.id}
              cacheKey={patient.currentPhotoId ?? undefined}
              alt="Foto"
              className="w-full h-full object-cover"
              fallback={initials(patient.name)}
            />
          ) : initials(patient.name)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          {[
            ['Idade', patient.birthDate ? `${calcAge(patient.birthDate)} anos` : '—'],
            ['Nascimento', patient.birthDate ? formatDate(patient.birthDate) : '—'],
            ['Sexo', patient.sex === 'F' ? 'Feminino' : patient.sex === 'M' ? 'Masculino' : patient.sex === 'I' ? 'Intersexo' : '—'],
            ['CNS', patient.cns || '—'],
            ['Celular', patient.cellphone || '—'],
            ['Telefone', patient.phone || '—'],
            ['E-mail', patient.email || '—'],
            ['Plano', patient.planoTipo],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-sm font-medium mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-border mb-6">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Dados' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <DataCard title="Identificação" rows={[
            ['Nome', patient.name],
            ['Nome social', patient.socialName || '—'],
            ['CPF', patient.cpf ? formatCPF(patient.cpf) : '—'],
            ['CNS', patient.cns || '—'],
          ]} />

          <div className="bg-white rounded-xl border border-border p-5 md:row-span-2">
            <h3 className="text-sm font-semibold mb-3">
              Documentos
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({patient.documents.length})
              </span>
            </h3>
            {patient.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento.</p>
            ) : (
              <ul className="space-y-2">
                {patient.documents.map(d => (
                  <li key={d.id} className="text-sm border-l-2 border-primary/40 pl-3">
                    <p className="font-medium">
                      {d.tipoCodigo || 'Documento'}
                      <span className="ml-2 text-muted-foreground font-normal">{d.numero}</span>
                    </p>
                    {(d.orgaoEmissor || d.ufEmissor) && (
                      <p className="text-xs text-muted-foreground">
                        {d.orgaoEmissor}{d.ufEmissor ? `/${d.ufEmissor}` : ''}
                        {d.dataEmissao ? ` · emit. ${formatDate(d.dataEmissao)}` : ''}
                        {d.dataValidade ? ` · val. ${formatDate(d.dataValidade)}` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DataCard title="Endereço" rows={[
            ['CEP', patient.cep || '—'],
            ['Endereço', `${patient.endereco || '—'}${patient.numero ? `, ${patient.numero}` : ''}${patient.complemento ? ` — ${patient.complemento}` : ''}`],
            ['Bairro', patient.bairro || '—'],
            ['Município/UF', patient.municipioIbge ? `${patient.municipioIbge}/${patient.uf}` : '—'],
          ]} />
          <DataCard title="Filiação" rows={[
            ['Mãe', patient.motherUnknown ? 'Desconhecida' : (patient.motherName || '—')],
            ['Pai',  patient.fatherUnknown ? 'Desconhecido' : (patient.fatherName || '—')],
            ['Responsável', patient.responsavelNome || '—'],
          ]} />
          <DataCard title="Emergência" rows={[
            ['Contato', patient.contatoEmergenciaNome || '—'],
            ['Telefone', patient.contatoEmergenciaTelefone || '—'],
          ]} />
          <DataCard title="Clínico" rows={[
            ['Alergias', patient.temAlergia ? (patient.alergias || 'Sim (sem detalhes)') : 'Não'],
            ['Doenças crônicas', patient.doencasCronicas || '—'],
            ['Gestante', patient.gestante ? 'Sim' : 'Não'],
            ['Fumante', patient.fumante === null ? '—' : patient.fumante ? 'Sim' : 'Não'],
            ['Etilista', patient.etilista === null ? '—' : patient.etilista ? 'Sim' : 'Não'],
          ]} />
          <DataCard title="Convênio" rows={[
            ['Tipo', patient.planoTipo],
            ['Nome', patient.convenioNome || '—'],
            ['Carteirinha', patient.convenioNumeroCarteirinha || '—'],
            ['Validade', patient.convenioValidade ? formatDate(patient.convenioValidade) : '—'],
          ]} />
        </div>
      )}

      {tab === 'Histórico' && (
        <div className="bg-white rounded-xl border border-border">
          <div className="p-4 border-b border-border flex items-center gap-3">
            <History size={16} className="text-muted-foreground" />
            <select
              value={historyField}
              onChange={e => setHistoryField(e.target.value)}
              className="text-sm border border-border rounded-lg bg-background px-3 py-1.5"
            >
              <option value="">Todos os campos</option>
              {fieldOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          {historyLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Sem alterações registradas.</div>
          ) : (
            <ul className="divide-y divide-border">
              {history.map(h => (
                <li key={h.id} className="p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                    <User2 size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold">{h.changedByName || 'Sistema'}</span>
                      {' '}
                      <span className="text-muted-foreground">
                        {h.changeType === 'create' ? 'criou o cadastro' :
                         h.changeType === 'delete' ? 'desativou o paciente' :
                         h.changeType === 'photo_upload' ? 'enviou uma nova foto' :
                         h.changeType === 'photo_remove' ? 'removeu a foto' :
                         `alterou ${h.fieldName}`}
                      </span>
                    </p>
                    {h.changeType === 'update' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="line-through">{h.oldValue || '(vazio)'}</span>
                        {' → '}
                        <span className="text-foreground">{h.newValue || '(vazio)'}</span>
                      </p>
                    )}
                    {h.reason && (
                      <p className="text-xs text-muted-foreground mt-1 italic">Motivo: {h.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(h.changedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function DataCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-sm">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
