import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Edit, History, User2, Trash2, FileText, X, RotateCcw, AlertTriangle } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { HttpError } from '../../api/client'
import { hspApi, type PatientFieldHistoryItem, type PatientRead } from '../../api/hsp'
import { referenceApi, type RefKind } from '../../api/reference'
import { PatientPhotoImg } from './components/PatientPhotoImg'
import { friendlyFieldName, friendlyValue, type RefMap } from './lib/historyLabels'
import { toast } from '../../store/toastStore'
import { promptDialog } from '../../store/dialogStore'
import { formatCPF, formatDate, formatDateTime, formatPhone, calcAge, initials, cn } from '../../lib/utils'
import { cepMask, cnsMask } from '../../lib/masks'

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
  const [previewPhoto, setPreviewPhoto] = useState<{ patientId: string; photoId: string } | null>(null)
  const [refs, setRefs] = useState<RefMap>({})

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

  // Carrega refs uma vez — usado pra resolver UUIDs no histórico em texto humano.
  useEffect(() => {
    const kinds: RefKind[] = [
      'nacionalidades', 'racas', 'etnias', 'logradouros',
      'estados-civis', 'escolaridades', 'religioes',
      'tipos-sanguineos', 'povos-tradicionais', 'parentescos',
      'orientacoes-sexuais', 'identidades-genero',
      'deficiencias',
    ]
    Promise.all(kinds.map(kind =>
      referenceApi.list(kind, { page: 1, pageSize: 500, active: true })
        .then(res => [kind, res.items] as const)
        .catch(() => [kind, [] as RefMap[string]] as const),
    )).then(pairs => {
      const map: RefMap = {}
      for (const [kind, items] of pairs) map[kind] = items
      setRefs(map)
    })
  }, [])

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
    const reason = await promptDialog({
      title: 'Desativar paciente?',
      message: 'O cadastro deixa de aparecer em buscas padrão. Você pode reativar depois.',
      placeholder: 'Motivo (opcional)',
      variant: 'danger',
      confirmLabel: 'Desativar',
    })
    if (reason === null) return  // cancelou
    try {
      await hspApi.remove(patient.id, reason || undefined)
      toast.success('Paciente desativado.')
      navigate('/hsp/pacientes/buscar')
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
    }
  }

  const handleReactivate = async () => {
    if (!patient) return
    const reason = await promptDialog({
      title: 'Reativar paciente?',
      message: 'O cadastro volta a aparecer em buscas padrão.',
      placeholder: 'Motivo (opcional)',
      confirmLabel: 'Reativar',
    })
    if (reason === null) return
    try {
      const updated = await hspApi.restore(patient.id, reason || undefined)
      setPatient(updated)
      toast.success('Paciente reativado.')
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
        subtitle={[
          patient.socialName ? `Registro: ${patient.name}` : null,
          `Prontuário ${patient.prontuario}`,
          patient.cpf ? `CPF ${formatCPF(patient.cpf)}` : null,
        ].filter(Boolean).join(' · ')}
        back="/hsp/pacientes/buscar"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/hsp/pacientes/${patient.id}/editar`)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted"
            >
              <Edit size={14} /> Editar
            </button>
            {patient.active ? (
              <button
                onClick={handleDeactivate}
                className="flex items-center gap-2 px-3 py-2 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-lg text-sm hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Trash2 size={14} /> Desativar
              </button>
            ) : (
              <button
                onClick={handleReactivate}
                className="flex items-center gap-2 px-3 py-2 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <RotateCcw size={14} /> Reativar
              </button>
            )}
          </div>
        }
      />

      {!patient.active && (
        <div className="mb-6 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-900 dark:text-amber-200 flex-1">
            <span className="font-semibold">Paciente inativo.</span>{' '}
            O cadastro não aparece em buscas padrão. Clique em Reativar para reverter.
          </p>
        </div>
      )}

      {/* Header card — só mostra blocos preenchidos */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6 flex items-start gap-5">
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
          {nonEmpty([
            ['Nascimento', patient.birthDate
              ? `${formatDate(patient.birthDate)} (${calcAge(patient.birthDate)} anos)`
              : null],
            ['Sexo', patient.sex === 'F' ? 'Feminino'
              : patient.sex === 'M' ? 'Masculino'
              : patient.sex === 'I' ? 'Intersexo' : null],
            ['CNS', patient.cns ? cnsMask.format(patient.cns) : null],
            ['Celular', patient.cellphone ? formatPhone(patient.cellphone) : null],
            ['Telefone', patient.phone ? formatPhone(patient.phone) : null],
            ['E-mail', patient.email || null],
            ['Plano', patient.planoTipo !== 'SUS' ? patient.planoTipo : null],
          ]).map(([k, v]) => (
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

      {tab === 'Dados' && (() => {
        // Cada seção renderiza só se tiver pelo menos um campo preenchido.
        const enderecoLinha = [
          patient.endereco,
          patient.numero ? `, ${patient.numero}` : '',
          patient.complemento ? ` — ${patient.complemento}` : '',
        ].filter(Boolean).join('') || null

        const sections = [
          {
            title: 'Identificação',
            rows: nonEmpty([
              ['Nome social', patient.socialName || null],
              ['CPF', patient.cpf ? formatCPF(patient.cpf) : null],
              ['CNS', patient.cns ? cnsMask.format(patient.cns) : null],
            ]),
          },
          {
            title: 'Endereço',
            rows: nonEmpty([
              ['CEP', patient.cep ? cepMask.format(patient.cep) : null],
              ['Endereço', enderecoLinha],
              ['Bairro', patient.bairro || null],
              ['Município/UF', patient.municipioIbge ? `${patient.municipioIbge}/${patient.uf}` : null],
            ]),
          },
          {
            title: 'Filiação',
            rows: nonEmpty([
              ['Mãe', patient.motherUnknown ? 'Desconhecida' : (patient.motherName || null)],
              ['Pai', patient.fatherUnknown ? 'Desconhecido' : (patient.fatherName || null)],
              ['Responsável', patient.responsavelNome || null],
              ['CPF do responsável', patient.responsavelCpf ? formatCPF(patient.responsavelCpf) : null],
            ]),
          },
          {
            title: 'Contato de emergência',
            rows: nonEmpty([
              ['Contato', patient.contatoEmergenciaNome || null],
              ['Telefone', patient.contatoEmergenciaTelefone
                ? formatPhone(patient.contatoEmergenciaTelefone) : null],
            ]),
          },
          {
            title: 'Clínico',
            rows: nonEmpty([
              patient.temAlergia ? ['Alergias', patient.alergias || 'Sim (sem detalhes)'] : null,
              patient.doencasCronicas ? ['Doenças crônicas', patient.doencasCronicas] : null,
              patient.gestante ? ['Gestante', 'Sim'] : null,
              patient.fumante !== null ? ['Fumante', patient.fumante ? 'Sim' : 'Não'] : null,
              patient.etilista !== null ? ['Etilista', patient.etilista ? 'Sim' : 'Não'] : null,
            ]),
          },
          {
            title: 'Convênio',
            rows: patient.planoTipo === 'SUS' ? [] : nonEmpty([
              ['Tipo', patient.planoTipo],
              ['Nome', patient.convenioNome || null],
              ['Carteirinha', patient.convenioNumeroCarteirinha || null],
              ['Validade', patient.convenioValidade ? formatDate(patient.convenioValidade) : null],
            ]),
          },
        ].filter(s => s.rows.length > 0)

        const hasDocuments = patient.documents.length > 0
        const hasObservacoes = !!patient.observacoes

        if (sections.length === 0 && !hasDocuments && !hasObservacoes) {
          return (
            <div className="bg-card rounded-xl border border-border p-10 text-center">
              <FileText size={28} className="mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">Cadastro mínimo</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Apenas os dados essenciais foram informados. Edite para complementar.
              </p>
              <button
                onClick={() => navigate(`/hsp/pacientes/${patient.id}/editar`)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
              >
                <Edit size={14} /> Completar cadastro
              </button>
            </div>
          )
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {hasDocuments && (
              <div className="bg-card rounded-xl border border-border p-5 md:row-span-2">
                <h3 className="text-sm font-semibold mb-3">
                  Documentos
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({patient.documents.length})
                  </span>
                </h3>
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
              </div>
            )}

            {sections.map(s => (
              <DataCard key={s.title} title={s.title} rows={s.rows} />
            ))}

            {hasObservacoes && (
              <div className="bg-card rounded-xl border border-border p-5 md:col-span-2">
                <h3 className="text-sm font-semibold mb-2">Observações</h3>
                <p className="text-sm whitespace-pre-wrap">{patient.observacoes}</p>
              </div>
            )}
          </div>
        )
      })()}

      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setPreviewPhoto(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={18} />
          </button>
          <div onClick={e => e.stopPropagation()} className="max-w-3xl w-full">
            <PatientPhotoImg
              patientId={previewPhoto.patientId}
              photoId={previewPhoto.photoId}
              alt="Foto"
              className="w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {tab === 'Histórico' && (
        <div className="bg-card rounded-xl border border-border">
          <div className="p-4 border-b border-border flex items-center gap-3">
            <History size={16} className="text-muted-foreground" />
            <select
              value={historyField}
              onChange={e => setHistoryField(e.target.value)}
              className="text-sm border border-border rounded-lg bg-background px-3 py-1.5"
            >
              <option value="">Todos os campos</option>
              {fieldOptions.map(f => (
                <option key={f} value={f}>{friendlyFieldName(f)}</option>
              ))}
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
                         h.changeType === 'document_add' ? `adicionou ${friendlyFieldName(h.fieldName)}` :
                         h.changeType === 'document_remove' ? `removeu ${friendlyFieldName(h.fieldName)}` :
                         h.changeType === 'document_update' ? `alterou ${friendlyFieldName(h.fieldName)}` :
                         `alterou ${friendlyFieldName(h.fieldName)}`}
                      </span>
                    </p>
                    {h.changeType === 'update' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="line-through">{friendlyValue(h.fieldName, h.oldValue, refs)}</span>
                        {' → '}
                        <span className="text-foreground">{friendlyValue(h.fieldName, h.newValue, refs)}</span>
                      </p>
                    )}
                    {(h.changeType === 'photo_upload' || h.changeType === 'photo_remove') && (
                      <div className="flex items-center gap-3 mt-2">
                        {h.oldValue && (
                          <PhotoThumb
                            patientId={patient.id}
                            photoId={h.oldValue}
                            label="Antes"
                            onOpen={setPreviewPhoto}
                          />
                        )}
                        {h.oldValue && h.newValue && (
                          <span className="text-muted-foreground text-xs">→</span>
                        )}
                        {h.newValue && (
                          <PhotoThumb
                            patientId={patient.id}
                            photoId={h.newValue}
                            label={h.oldValue ? 'Depois' : 'Nova foto'}
                            onOpen={setPreviewPhoto}
                          />
                        )}
                      </div>
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

type Row = [string, string | null] | null

/** Filtra pares cuja segunda posição é vazia, e remove `null` da lista. */
function nonEmpty(rows: Row[]): Array<[string, string]> {
  return rows.filter((r): r is [string, string] => r !== null && r[1] !== null && r[1] !== '')
}

function PhotoThumb({ patientId, photoId, label, onOpen }: {
  patientId: string
  photoId: string
  label: string
  onOpen: (p: { patientId: string; photoId: string }) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => onOpen({ patientId, photoId })}
        className="w-14 h-14 rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
        title="Ampliar"
      >
        <PatientPhotoImg
          patientId={patientId}
          photoId={photoId}
          alt={label}
          className="w-full h-full object-cover"
        />
      </button>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}

function DataCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
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
