// Hook de anúncio de voz pro painel de chamadas. Usa Web Speech API
// (``window.speechSynthesis``) — zero lib, funciona no Chrome/Safari
// recentes. Enquanto ``enabled=false`` fica passivo: nada fala, mas a
// tubulação está pronta; basta ligar no painel lógico.
//
// Formato de fala: depende do modo do painel:
//   - 'senha'  → "senha R-047, guichê 2"
//   - 'nome'   → "Ana Ferreira, guichê 2"
//   - 'ambos'  → "Ana Ferreira, senha R-047, guichê 2"

import { useEffect, useRef } from 'react'
import type { LiveCall } from '../store/liveCallStore'

type Mode = 'senha' | 'nome' | 'ambos'

interface Options {
  enabled: boolean
  mode: Mode
  /** O último ``current`` do liveCallStore — reanuncia quando muda. */
  call: LiveCall | null
}

export function usePainelAnnouncer({ enabled, mode, call }: Options) {
  // Guarda o id da última chamada já anunciada pra não repetir.
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !call) return
    if (lastIdRef.current === call.id) return
    lastIdRef.current = call.id

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const parts: string[] = []
    if (mode === 'nome' || mode === 'ambos') {
      if (call.patientName) parts.push(call.patientName)
    }
    if (mode === 'senha' || mode === 'ambos') {
      parts.push(`senha ${spellTicket(call.ticket)}`)
    }
    parts.push(call.counter)
    const text = parts.join(', ')
    if (!text.trim()) return

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'pt-BR'
    utter.rate = 0.95
    utter.pitch = 1
    // Cancela fala anterior pra não acumular.
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }, [enabled, mode, call])
}

// Lê "R-047" como "R zero quatro sete" em vez de "r menos quarenta e sete"
// — o TTS fica mais claro numa sala barulhenta.
function spellTicket(ticket: string): string {
  return ticket
    .replace(/-/g, ' ')
    .split('')
    .map(ch => /[0-9]/.test(ch) ? ch + ' ' : ch)
    .join('')
}
