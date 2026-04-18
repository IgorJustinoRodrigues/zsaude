import { useEffect, useState } from 'react'
import { authApi, type AnniversaryResponse } from '../api/auth'
import { useAuthStore } from '../store/authStore'

/**
 * Hook do modal de aniversário.
 *
 * Fluxo:
 * 1. Em qualquer mount do shell, chama ``/users/me/anniversary``.
 * 2. Se é o dia do aniversário, guarda ``data`` — isso habilita o ícone
 *    de bolo no nav (que abre o modal sob demanda quando clicado).
 * 3. Auto-abre o modal **apenas uma vez por dia** (grava em localStorage
 *    no MOMENTO DA ABERTURA; fechar a aba não reabre na próxima sessão).
 *
 * Retorno:
 * - ``isBirthday``: true quando hoje é o aniversário (mostra o ícone).
 * - ``data``: resposta completa do endpoint (pra passar ao modal).
 * - ``modalOpen``: estado controlado — verdadeiro quando o modal deve
 *   aparecer (seja por auto-abertura ou clique no ícone).
 * - ``openModal()``: força a abertura (usado pelo ícone do nav).
 * - ``closeModal()``: fecha o modal.
 */
export function useBirthdayCheck() {
  const userId = useAuthStore(s => s.user?.id)
  const [data, setData] = useState<AnniversaryResponse | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!userId) {
      setData(null)
      return
    }
    let alive = true
    authApi.anniversary()
      .then(res => {
        if (!alive) return
        if (!res.isBirthday) return
        setData(res)
        // Auto-abre só se ainda não vimos hoje. Marca IMEDIATAMENTE
        // ao decidir abrir — não precisa esperar fechamento; fechar a
        // aba não reabre o modal na próxima carga do mesmo dia.
        const key = makeKey(userId)
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, '1')
          setModalOpen(true)
        }
      })
      .catch(() => { /* silencioso — falha não bloqueia nada */ })
    return () => { alive = false }
  }, [userId])

  return {
    isBirthday: !!data,
    data,
    modalOpen,
    openModal: () => setModalOpen(true),
    closeModal: () => setModalOpen(false),
  }
}

function makeKey(userId: string): string {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `bday:${userId}:${y}-${m}-${d}`
}
