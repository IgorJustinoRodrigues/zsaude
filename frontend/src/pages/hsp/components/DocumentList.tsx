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

// Tailwind requer classes literais — mapping pra evitar interpolação dinâmica.
const COL_SPAN: Record<number, string> = {
  1: 'md:col-span-1', 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4',
  5: 'md:col-span-5', 6: 'md:col-span-6', 7: 'md:col-span-7', 8: 'md:col-span-8',
  9: 'md:col-span-9', 10: 'md:col-span-10', 11: 'md:col-span-11', 12: 'md:col-span-12',
}

// ─── Schema por tipo ─────────────────────────────────────────────────────
// Define quais campos são exibidos para cada código, com labels e
// placeholders contextualizados. Campos não listados ficam ocultos
// (e o usuário pode ver tudo escolhendo "Outro" / OUT).

type DocField =
  | 'numero' | 'orgaoEmissor' | 'ufEmissor' | 'paisEmissor'
  | 'dataEmissao' | 'dataValidade' | 'observacao'

interface FieldSpec {
  key: DocField
  label: string
  hint?: string
  required?: boolean
  /** Largura no grid (cols out of 12). Default = 3. */
  cols?: number
  uppercase?: boolean
  maxLength?: number
}

const NUMERO = (label = 'Número', hint?: string, cols = 4): FieldSpec => ({
  key: 'numero', label, hint, required: true, cols, maxLength: 40,
})
const DATA_EMISSAO = (label = 'Data de emissão', cols = 3): FieldSpec => ({
  key: 'dataEmissao', label, cols,
})
const DATA_VALIDADE = (label = 'Validade', cols = 3): FieldSpec => ({
  key: 'dataValidade', label, cols,
})
const UF = (label = 'UF', cols = 2): FieldSpec => ({
  key: 'ufEmissor', label, cols, uppercase: true, maxLength: 2,
})
const PAIS = (label = 'País', hint = 'ISO (3 letras)', cols = 2): FieldSpec => ({
  key: 'paisEmissor', label, hint, cols, uppercase: true, maxLength: 3,
})
const OBSERVACAO: FieldSpec = {
  key: 'observacao', label: 'Observação', cols: 12, maxLength: 500,
}

const SCHEMAS: Record<string, FieldSpec[]> = {
  RG: [
    NUMERO('Número do RG', undefined, 4),
    { key: 'orgaoEmissor', label: 'Órgão emissor', hint: 'Ex.: SSP, SDS', cols: 3, maxLength: 40 },
    UF(),
    DATA_EMISSAO(),
  ],
  CNH: [
    NUMERO('Número da CNH', undefined, 4),
    { key: 'orgaoEmissor', label: 'Categoria', hint: 'A, B, AB, C, D, E', cols: 2, uppercase: true, maxLength: 4 },
    UF('UF emissor'),
    DATA_EMISSAO('Emissão', 2),
    DATA_VALIDADE('Validade', 2),
  ],
  CTPS: [
    NUMERO('Número da CTPS', undefined, 4),
    { key: 'orgaoEmissor', label: 'Série', cols: 2, maxLength: 10 },
    UF(),
    DATA_EMISSAO(),
  ],
  PASS: [
    NUMERO('Número do passaporte', undefined, 4),
    PAIS('País emissor', 'ISO (3 letras)', 2),
    DATA_EMISSAO('Emissão', 3),
    DATA_VALIDADE('Validade', 3),
  ],
  CRNM: [
    NUMERO('Número (RNM)', undefined, 4),
    PAIS('País de origem', 'ISO (3 letras)', 2),
    DATA_EMISSAO('Emissão', 3),
    DATA_VALIDADE('Validade', 3),
  ],
  CIN: [
    NUMERO('Número da CIN', undefined, 4),
    { key: 'orgaoEmissor', label: 'Órgão emissor', cols: 3, maxLength: 40 },
    UF(),
    DATA_EMISSAO(),
  ],
  RIC: [
    NUMERO('Número', undefined, 6),
    DATA_EMISSAO('Emissão', 3),
  ],
  NIS: [
    NUMERO('Número (NIS/PIS)', '11 dígitos', 6),
  ],
  TIT: [
    NUMERO('Número do título', '12 dígitos', 5),
    UF('UF', 2),
    { key: 'orgaoEmissor', label: 'Zona / Seção', hint: 'Opcional', cols: 3, maxLength: 20 },
  ],
  CADU: [
    NUMERO('Número CadÚnico', undefined, 6),
  ],
  CN: [
    NUMERO('Número da matrícula', undefined, 5),
    { key: 'orgaoEmissor', label: 'Cartório', cols: 4, maxLength: 40 },
    UF(),
    DATA_EMISSAO(),
  ],
  CC: [
    NUMERO('Número da matrícula', undefined, 5),
    { key: 'orgaoEmissor', label: 'Cartório', cols: 4, maxLength: 40 },
    UF(),
    DATA_EMISSAO(),
  ],
  // Default ("Outro" ou tipo desconhecido) — todos os campos
  OUT: [
    NUMERO('Número', undefined, 4),
    { key: 'orgaoEmissor', label: 'Órgão emissor', cols: 3, maxLength: 40 },
    UF(),
    PAIS(),
    DATA_EMISSAO('Emissão', 3),
    DATA_VALIDADE('Validade', 3),
    OBSERVACAO,
  ],
}

function schemaFor(codigo: string): FieldSpec[] {
  if (!codigo) return []           // sem tipo escolhido → não mostra campos
  return SCHEMAS[codigo] ?? SCHEMAS.OUT
}

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
    const newCodigo = t?.codigo ?? ''
    // Limpa campos que somem com o novo schema, pra não enviar lixo.
    const oldCodigo = value[i].tipoCodigo
    if (newCodigo !== oldCodigo) {
      const nextSchemaKeys = new Set(schemaFor(newCodigo).map(f => f.key))
      update(i, {
        tipoDocumentoId: tipoId,
        tipoCodigo: newCodigo,
        orgaoEmissor: nextSchemaKeys.has('orgaoEmissor') ? value[i].orgaoEmissor : '',
        ufEmissor:    nextSchemaKeys.has('ufEmissor')    ? value[i].ufEmissor    : '',
        paisEmissor:  nextSchemaKeys.has('paisEmissor')  ? value[i].paisEmissor  : '',
        dataEmissao:  nextSchemaKeys.has('dataEmissao')  ? value[i].dataEmissao  : null,
        dataValidade: nextSchemaKeys.has('dataValidade') ? value[i].dataValidade : null,
        observacao:   nextSchemaKeys.has('observacao')   ? value[i].observacao   : '',
      })
    } else {
      update(i, { tipoDocumentoId: tipoId, tipoCodigo: newCodigo })
    }
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
          <FileText size={28} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum documento cadastrado.</p>
        </div>
      ) : (
        value.map((doc, i) => {
          const schema = schemaFor(doc.tipoCodigo)
          return (
            <div
              key={doc.id ?? `new-${i}`}
              className="border border-border rounded-xl p-4 bg-muted/20 relative"
            >
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-3 right-3 p-1.5 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                title="Remover documento"
              >
                <Trash2 size={14} />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                {/* Tipo — sempre presente */}
                <div className="md:col-span-3">
                  <FormField label="Tipo" required>
                    <ComboBox
                      value={doc.tipoDocumentoId}
                      options={tipoOptions}
                      onChange={v => onTipoChange(i, v)}
                    />
                  </FormField>
                </div>

                {/* Sem tipo: mostra só uma dica e oculta o resto */}
                {schema.length === 0 && (
                  <div className="md:col-span-9 flex items-center text-xs text-muted-foreground pl-1 pt-6">
                    Selecione o tipo para ver os campos.
                  </div>
                )}

                {/* Demais campos do schema do tipo escolhido */}
                {schema.map(f => (
                  <div key={f.key} className={COL_SPAN[f.cols ?? 3]}>
                    <FormField label={f.label} hint={f.hint} required={f.required}>
                      {f.key === 'dataEmissao' || f.key === 'dataValidade' ? (
                        <input
                          type="date"
                          value={doc[f.key] ?? ''}
                          onChange={e => update(i, { [f.key]: e.target.value || null })}
                          className={inputCls}
                        />
                      ) : (
                        <input
                          value={doc[f.key] ?? ''}
                          onChange={e => {
                            const v = f.uppercase ? e.target.value.toUpperCase() : e.target.value
                            update(i, { [f.key]: f.maxLength ? v.slice(0, f.maxLength) : v })
                          }}
                          maxLength={f.maxLength}
                          className={cn(inputCls, f.uppercase && 'uppercase')}
                        />
                      )}
                    </FormField>
                  </div>
                ))}
              </div>
            </div>
          )
        })
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
