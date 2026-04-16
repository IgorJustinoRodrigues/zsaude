import { useCallback, useState } from 'react'
import { HttpError } from '../api/client'
import type { AIOperationResponse, AIUsageMeta } from '../api/ai'
import { toast } from '../store/toastStore'

interface UseAIOperationReturn<TIn, TOut> {
  run: (input: TIn, moduleCode: string, idempotencyKey?: string) => Promise<AIOperationResponse<TOut> | null>
  loading: boolean
  error: string | null
  lastUsage: AIUsageMeta | null
  reset: () => void
}

type OpCall<TIn, TOut> = (
  input: TIn,
  args: { moduleCode: string; idempotencyKey?: string },
) => Promise<AIOperationResponse<TOut>>

/**
 * Wrapper pra operações de IA com loading/error/toast automáticos.
 *
 * Retorna `null` em caso de erro (em vez de throw) — o chamador verifica
 * e reage sem precisar try/catch. Toasts mostram o motivo ao usuário.
 */
export function useAIOperation<TIn, TOut>(
  op: OpCall<TIn, TOut>,
  opts: { silent?: boolean } = {},
): UseAIOperationReturn<TIn, TOut> {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUsage, setLastUsage] = useState<AIUsageMeta | null>(null)

  const run = useCallback(
    async (input: TIn, moduleCode: string, idempotencyKey?: string) => {
      setLoading(true)
      setError(null)
      try {
        const resp = await op(input, { moduleCode, idempotencyKey })
        setLastUsage(resp.usage)
        return resp
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : 'Falha na operação de IA.'
        setError(msg)
        if (!opts.silent) toast.error('IA indisponível', msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [op, opts.silent],
  )

  const reset = useCallback(() => {
    setError(null)
    setLastUsage(null)
  }, [])

  return { run, loading, error, lastUsage, reset }
}
