import { useState } from 'react'
import { Search, X, Database, Loader2, User2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cadsusApi, type CadsusPatientResult } from '../../../api/cadsus'
import { HttpError } from '../../../api/client'
import { FormField } from '../../../components/ui/FormField'
import { MaskedInput } from '../../../components/ui/MaskedInput'
import { cnsMask, cpfMask } from '../../../lib/masks'
import { validateCns, validateCpf } from '../../../lib/validators'
import { formatCPF, formatDate, cn } from '../../../lib/utils'

interface Props {
  onClose: () => void
  onPick: (p: CadsusPatientResult) => void
  /** Pré-preenche com dados conhecidos (ex: CPF já digitado no form). */
  initial?: { cpf?: string; cns?: string; nome?: string; dataNascimento?: string }
}

type Mode = 'cpf' | 'cns' | 'nome'

/**
 * Modal de busca no CadSUS (DATASUS). 3 modos: CPF, CNS, Nome+Nascimento.
 * Ao clicar num resultado, chama `onPick` e fecha.
 */
export function CadsusSearchModal({ onClose, onPick, initial }: Props) {
  const [mode, setMode] = useState<Mode>(
    initial?.cpf ? 'cpf' : initial?.cns ? 'cns' : 'nome'
  )
  const [cpf, setCpf] = useState(initial?.cpf ?? '')
  const [cns, setCns] = useState(initial?.cns ?? '')
  const [nome, setNome] = useState(initial?.nome ?? '')
  const [dataNascimento, setDataNascimento] = useState(initial?.dataNascimento ?? '')
  const [nomeMae, setNomeMae] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<CadsusPatientResult[] | null>(null)
  const [mockSource, setMockSource] = useState(false)

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
    if (mode === 'nome' && !nome.trim()) return 'Informe o nome.'
    return null
  }

  const handleSearch = async () => {
    const err = validate()
    if (err) { setError(err); return }

    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const res = await cadsusApi.search({
        cpf: mode === 'cpf' ? cpf : undefined,
        cns: mode === 'cns' ? cns : undefined,
        nome: mode === 'nome' ? nome.trim() : undefined,
        dataNascimento: mode === 'nome' ? (dataNascimento || undefined) : undefined,
        nomeMae: mode === 'nome' ? (nomeMae.trim() || undefined) : undefined,
      })
      setResults(res.items)
      setMockSource(res.source === 'mock')
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 503) {
          setError('Integração com o CadSUS não está configurada neste ambiente.')
        } else {
          setError(e.message)
        }
      } else {
        setError('Falha de comunicação com o CadSUS.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Database size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Buscar no CadSUS</h3>
              <p className="text-xs text-muted-foreground">
                Consulta o cadastro federal de pacientes (DATASUS).
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 border-b border-border space-y-4">
          <div className="flex gap-2 flex-wrap">
            {([
              { id: 'cpf', label: 'CPF' },
              { id: 'cns', label: 'CNS' },
              { id: 'nome', label: 'Nome + Nascimento' },
            ] as const).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setMode(t.id); setResults(null); setError(null) }}
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

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {mode === 'cpf' && (
              <div className="md:col-span-8">
                <FormField label="CPF">
                  <MaskedInput value={cpf} onChange={setCpf} mask={cpfMask}
                    placeholder="000.000.000-00" autoFocus />
                </FormField>
              </div>
            )}

            {mode === 'cns' && (
              <div className="md:col-span-8">
                <FormField label="CNS" hint="15 dígitos">
                  <MaskedInput value={cns} onChange={setCns} mask={cnsMask}
                    placeholder="000 0000 0000 0000" autoFocus />
                </FormField>
              </div>
            )}

            {mode === 'nome' && (
              <>
                <div className="md:col-span-8">
                  <FormField label="Nome">
                    <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
                      className="text-sm border border-border rounded-lg bg-background px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </FormField>
                </div>
                <div className="md:col-span-4">
                  <FormField label="Data de nascimento" hint="Opcional">
                    <input type="date" value={dataNascimento}
                      onChange={e => setDataNascimento(e.target.value)}
                      className="text-sm border border-border rounded-lg bg-background px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </FormField>
                </div>
                <div className="md:col-span-12">
                  <FormField label="Nome da mãe" hint="Opcional — melhora precisão">
                    <input value={nomeMae} onChange={e => setNomeMae(e.target.value)}
                      className="text-sm border border-border rounded-lg bg-background px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </FormField>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {loading ? 'Consultando...' : 'Consultar CadSUS'}
            </button>
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {error && (
            <div className="m-5 p-4 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {mockSource && results && (
            <div className="m-5 mb-0 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle size={13} /> Modo de desenvolvimento — dados fictícios.
            </div>
          )}

          {results && results.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhum paciente encontrado.
            </div>
          )}

          {results && results.length > 0 && (
            <ul className="divide-y divide-border">
              {results.map((p, i) => (
                <li
                  key={`${p.cns || p.cpf || p.nome}-${i}`}
                  onClick={() => onPick(p)}
                  className="px-5 py-4 cursor-pointer hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <User2 size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.cns && `CNS ${p.cns}`}
                        {p.cpf && ` · CPF ${formatCPF(p.cpf)}`}
                        {p.dataNascimento && ` · Nasc. ${formatDate(p.dataNascimento)}`}
                      </p>
                      {p.nomeMae && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Mãe: {p.nomeMae}
                        </p>
                      )}
                    </div>
                    <CheckCircle2 size={16} className="text-primary shrink-0 opacity-0 group-hover:opacity-100" />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!results && !error && !loading && (
            <div className="p-10 text-center text-xs text-muted-foreground">
              Escolha um critério e clique em Consultar para buscar no cadastro federal.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
