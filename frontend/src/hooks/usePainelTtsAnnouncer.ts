// Announcer TTS via ElevenLabs (ou Google — escolhido pelo sys).
//
// Substitui o ``usePainelAnnouncer`` antigo (speechSynthesis do browser).
// Fluxo por call:
// 1. Composer monta as frases: ["Atenção!", "Senha P-1", "Guichê 1"]
//    (ou nome em vez de senha, dependendo do modo)
// 2. POST /rec/tts/prepare → URLs em sequência
// 3. enqueue no AudioQueue — toca sem cortar chamada anterior
//
// Fallback: se /prepare falha ou não há voz configurada, delega pra
// o speechSynthesis do browser (hook usePainelAnnouncer antigo).

import { useEffect, useRef } from 'react'
import { ttsRuntimeApi } from '../api/tts'
import { HttpError } from '../api/client'
import { type AudioQueue } from './useAudioQueue'

type PainelMode = 'senha' | 'nome' | 'ambos'

interface LiveCall {
  id: string
  ticket: string
  counter: string
  patientName: string | null
  priority: boolean
  at: Date
}

interface Options {
  enabled: boolean
  mode: PainelMode
  call: LiveCall | null
  queue: AudioQueue
  deviceToken: string | null
  voiceId?: string | null
  /** Chamado se o TTS falhar totalmente e precisar cair no fallback. */
  onFallback?: (call: LiveCall) => void
}

/** Remove zeros à esquerda do número da senha: ``P-001`` → ``P-1``. */
function normalizeTicket(ticket: string): string {
  return ticket.replace(/-0+(\d)/, '-$1')
}

function hasRealName(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim().toLowerCase()
  return !!n && n !== 'anônimo' && n !== 'anonimo'
}

/**
 * Compõe as frases a tocar dado o modo de exibição + dados da chamada.
 * Cada frase vira UM áudio separado (cacheado pelo backend). Voltar a
 * chamar com o mesmo nome/guichê = zero custo.
 */
export function composeCallPhrases(
  mode: PainelMode,
  call: { ticket: string; patientName: string | null; counter: string },
): string[] {
  const phrases: string[] = ['Atenção!']
  const normalizedTicket = normalizeTicket(call.ticket)
  const useName = (mode === 'nome' || mode === 'ambos') && hasRealName(call.patientName)

  if (mode === 'nome' && useName) {
    phrases.push(call.patientName!)
  } else if (mode === 'ambos' && useName) {
    phrases.push(call.patientName!)
    phrases.push(`Senha ${normalizedTicket}`)
  } else {
    phrases.push(`Senha ${normalizedTicket}`)
  }

  if (call.counter && call.counter.trim()) {
    phrases.push(call.counter)
  }

  return phrases
}

export function usePainelTtsAnnouncer({
  enabled, mode, call, queue, deviceToken, voiceId, onFallback,
}: Options) {
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !call) return
    if (lastIdRef.current === call.id) return
    lastIdRef.current = call.id

    if (!deviceToken) {
      onFallback?.(call)
      return
    }

    const phrases = composeCallPhrases(mode, {
      ticket: call.ticket,
      patientName: call.patientName,
      counter: call.counter,
    })

    ;(async () => {
      try {
        const resp = await ttsRuntimeApi.prepare(deviceToken, {
          phrases,
          voiceId: voiceId ?? null,
        })
        queue.enqueue(resp.audios.map(a => a.url))
      } catch (err) {
        // Backend não tem voz configurada, provider fora do ar, etc.
        // Cai pro fallback sem travar o painel.
        if (err instanceof HttpError) {
          console.warn('[tts] /prepare failed; falling back to speech synth:', err.message)
        } else {
          console.warn('[tts] /prepare network error; falling back to speech synth')
        }
        onFallback?.(call)
      }
    })()
  }, [enabled, mode, call, queue, deviceToken, voiceId, onFallback])
}
