// Console da atendente da Recepção.
//
// Fluxo principal: ver fila, chamar próximo (ou qualquer um da lista),
// registrar chegada manual. Ainda sem backend — tudo mock.

import { useEffect, useState } from 'react'
import { Clock, PhoneCall, Plus, Search, UserPlus } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { cn } from '../../lib/utils'

interface QueueEntry {
  id: string
  ticket: string
  patientName: string | null
  priority: boolean
  arrivedAt: Date
}

const MOCK_QUEUE_INITIAL: QueueEntry[] = [
  { id: '1', ticket: 'P-012', patientName: 'Raimundo Oliveira',  priority: true,  arrivedAt: at(-18) },
  { id: '2', ticket: 'R-047', patientName: 'Carla Monteiro',     priority: false, arrivedAt: at(-15) },
  { id: '3', ticket: 'R-048', patientName: 'Joana da Silva',     priority: false, arrivedAt: at(-11) },
  { id: '4', ticket: 'P-013', patientName: null,                 priority: true,  arrivedAt: at(-8)  },
  { id: '5', ticket: 'R-049', patientName: 'Luiz Fernando',      priority: false, arrivedAt: at(-6)  },
  { id: '6', ticket: 'R-050', patientName: 'Maria Aparecida',    priority: false, arrivedAt: at(-4)  },
  { id: '7', ticket: 'R-051', patientName: null,                 priority: false, arrivedAt: at(-2)  },
]

const COUNTERS = ['Guichê 1', 'Guichê 2', 'Guichê 3'] as const

export function RecQueuePage() {
  const [counter, setCounter] = useState<string>(COUNTERS[0])
  const [queue, setQueue] = useState<QueueEntry[]>(MOCK_QUEUE_INITIAL)
  const [current, setCurrent] = useState<QueueEntry | null>(null)

  function callEntry(id: string) {
    setQueue(q => {
      const picked = q.find(e => e.id === id)
      if (picked) setCurrent(picked)
      return q.filter(e => e.id !== id)
    })
  }

  // "Chamar próximo" — respeita prioridade: primeiro prioritário, senão primeiro da fila.
  function callNext() {
    const firstPriority = queue.find(e => e.priority)
    const target = firstPriority ?? queue[0]
    if (target) callEntry(target.id)
  }

  return (
    <div>
      <PageHeader title="Recepção" subtitle="Aguardando atendimento" />

      {/* Barra de ações compacta: guichê + chamada atual + CTA */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          {COUNTERS.map(c => (
            <button
              key={c}
              onClick={() => setCounter(c)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                counter === c
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {current && (
          <div className="flex items-baseline gap-2 px-3 py-1.5 rounded-lg border border-border bg-card">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Chamando</span>
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: current.priority ? '#dc2626' : '#0d9488' }}
            >
              {current.ticket}
            </span>
            <span className="text-xs text-muted-foreground truncate max-w-[16ch]">
              {current.patientName ?? '—'}
            </span>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={callNext}
          disabled={queue.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <PhoneCall size={15} />
          Chamar próximo
        </button>
      </div>

      {/* Fila + ações rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold">Aguardando</h2>
            <span className="text-xs text-muted-foreground">
              {queue.length} {queue.length === 1 ? 'pessoa' : 'pessoas'}
            </span>
          </div>

          {queue.length === 0 ? (
            <div className="bg-card border border-border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground italic">
              Fila vazia.
            </div>
          ) : (
            <ul className="space-y-2">
              {queue.map(entry => (
                <li
                  key={entry.id}
                  className="bg-card border border-border rounded-xl p-3 flex items-center gap-4 hover:border-primary/40 transition-colors"
                >
                  <span
                    className="text-2xl font-black tabular-nums shrink-0 min-w-[5.5rem]"
                    style={{ color: entry.priority ? '#dc2626' : '#0d9488' }}
                  >
                    {entry.ticket}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {entry.patientName ?? <span className="italic text-muted-foreground">Sem nome informado</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock size={11} />
                      <WaitLabel since={entry.arrivedAt} />
                      {entry.priority && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-semibold uppercase tracking-wider">
                          Prioridade
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => callEntry(entry.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 hover:bg-teal-50 transition-colors"
                  >
                    <PhoneCall size={13} />
                    Chamar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-2">
          <h2 className="text-sm font-semibold mb-3">Ações</h2>
          <ActionButton icon={UserPlus} label="Registrar chegada" onClick={() => {/* TODO: abrir modal cadastro */}} />
          <ActionButton icon={Search}   label="Buscar paciente"    onClick={() => {/* TODO */}} />
          <ActionButton icon={Plus}     label="Gerar senha manual" onClick={() => {/* TODO */}} />
        </aside>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ──────────────────────────────────────────────────

interface ActionButtonProps {
  icon: typeof Plus
  label: string
  onClick: () => void
  variant?: 'default' | 'ghost'
}

function ActionButton({ icon: Icon, label, onClick, variant = 'default' }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors',
        variant === 'default'
          ? 'bg-card border border-border hover:border-primary/40 hover:bg-muted/40'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

function WaitLabel({ since }: { since: Date }) {
  // Re-renderiza a cada 30s pra manter o "há X min" fresco sem flicker.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick(t => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const min = Math.max(0, Math.floor((Date.now() - since.getTime()) / 60_000))
  if (min < 1) return <>agora</>
  if (min < 60) return <>há {min} min</>
  const h = Math.floor(min / 60)
  return <>há {h}h {min % 60}min</>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function at(minutesFromNow: number): Date {
  return new Date(Date.now() + minutesFromNow * 60 * 1000)
}
