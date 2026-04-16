import { Plus, Trash2, FileText } from 'lucide-react'
import { ComboBox, type ComboBoxOption } from '../../../components/ui/ComboBox'
import { FormField } from '../../../components/ui/FormField'
import type { PatientDocumentInput } from '../../../api/hsp'
import { cn } from '../../../lib/utils'

interface RefItem { id: string; codigo: string; descricao: string }

interface Props {
  value: PatientDocumentInput[]
  onChange: (next: PatientDocumentInput[]) => void
  /** ref_tipos_documento — fonte da combobox de tipo. */
  tiposDocumento: RefItem[]
}

const empty: PatientDocumentInput = {
  tipoDocumentoId: null,
  tipoCodigo: '',
  numero: '',
  orgaoEmissor: '',
  ufEmissor: '',
  paisEmissor: '',
  dataEmissao: null,
  dataValidade: null,
  observacao: '',
}

const inputCls =
  'text-sm border border-border rounded-lg bg-background px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

export function DocumentList({ value, onChange, tiposDocumento }: Props) {
  const tipoOptions: ComboBoxOption[] = tiposDocumento
    .slice()
    .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'))
    .map(t => ({ value: t.id, label: t.descricao, hint: t.codigo, searchText: t.codigo }))

  const update = (i: number, patch: Partial<PatientDocumentInput>) => {
    const next = value.map((d, idx) => idx === i ? { ...d, ...patch } : d)
    onChange(next)
  }

  const add = () => onChange([...value, { ...empty }])

  const remove = (i: number) => {
    if (!confirm('Remover este documento?')) return
    onChange(value.filter((_, idx) => idx !== i))
  }

  const onTipoChange = (i: number, tipoId: string | null) => {
    const t = tiposDocumento.find(x => x.id === tipoId)
    update(i, { tipoDocumentoId: tipoId, tipoCodigo: t?.codigo ?? '' })
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
          <FileText size={28} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum documento cadastrado.</p>
        </div>
      ) : (
        value.map((doc, i) => (
          <div
            key={doc.id ?? `new-${i}`}
            className="border border-border rounded-xl p-4 bg-muted/20 relative"
          >
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-3 right-3 p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
              title="Remover documento"
            >
              <Trash2 size={14} />
            </button>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <FormField label="Tipo" required>
                  <ComboBox
                    value={doc.tipoDocumentoId}
                    options={tipoOptions}
                    onChange={v => onTipoChange(i, v)}
                  />
                </FormField>
              </div>

              <div className="md:col-span-4">
                <FormField label="Número" required>
                  <input
                    value={doc.numero}
                    onChange={e => update(i, { numero: e.target.value })}
                    maxLength={40}
                    className={inputCls}
                  />
                </FormField>
              </div>

              <div className="md:col-span-3">
                <FormField label="Órgão emissor">
                  <input
                    value={doc.orgaoEmissor}
                    onChange={e => update(i, { orgaoEmissor: e.target.value })}
                    maxLength={40}
                    className={inputCls}
                  />
                </FormField>
              </div>

              <div className="md:col-span-2">
                <FormField label="UF">
                  <input
                    value={doc.ufEmissor}
                    onChange={e => update(i, { ufEmissor: e.target.value.toUpperCase().slice(0, 2) })}
                    className={cn(inputCls, 'uppercase')}
                  />
                </FormField>
              </div>

              <div className="md:col-span-3">
                <FormField label="Data emissão">
                  <input
                    type="date"
                    value={doc.dataEmissao ?? ''}
                    onChange={e => update(i, { dataEmissao: e.target.value || null })}
                    className={inputCls}
                  />
                </FormField>
              </div>

              <div className="md:col-span-3">
                <FormField label="Validade" hint="Opcional (CNH/Passaporte)">
                  <input
                    type="date"
                    value={doc.dataValidade ?? ''}
                    onChange={e => update(i, { dataValidade: e.target.value || null })}
                    className={inputCls}
                  />
                </FormField>
              </div>

              <div className="md:col-span-2">
                <FormField label="País emissor" hint="ISO (3 letras)">
                  <input
                    value={doc.paisEmissor}
                    onChange={e => update(i, { paisEmissor: e.target.value.toUpperCase().slice(0, 3) })}
                    maxLength={3}
                    className={cn(inputCls, 'uppercase')}
                  />
                </FormField>
              </div>

              <div className="md:col-span-4">
                <FormField label="Observação">
                  <input
                    value={doc.observacao}
                    onChange={e => update(i, { observacao: e.target.value })}
                    maxLength={500}
                    className={inputCls}
                  />
                </FormField>
              </div>
            </div>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus size={14} /> Adicionar documento
      </button>
    </div>
  )
}
