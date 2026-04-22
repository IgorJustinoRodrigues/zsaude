// Announcer TTS via ElevenLabs (ou Google — escolhido pelo sys).
//
// Substitui o ``usePainelAnnouncer`` antigo (speechSynthesis do browser).
// Fluxo por call:
// 1. Composer monta as frases: ["Atenção!", "Senha P-1", "Guichê 1"]
//    (ou nome em vez de senha, dependendo do modo)
// 2. POST /rec/tts/prepare → URLs em sequência
// 3. enqueue no AudioQueue — toca sem cortar chamada anterior
// 4. Ao terminar (incl. repetições), chama ``advance()`` na store pra
//    puxar a próxima chamada da fila ``pending``
//
// Repetições: entre iterações coloca 2s de silêncio pra a voz não
// atropelar. Cada frase é cacheada, então repetir = zero custo no backend.
//
// Fallback: se /prepare falha ou não há voz configurada, delega pra
// o speechSynthesis do browser (hook usePainelAnnouncer antigo).

import { useEffect, useRef } from 'react'
import { ttsRuntimeApi } from '../api/tts'
import { HttpError } from '../api/client'
import { type AudioQueue, type AudioQueueItem } from './useAudioQueue'

type PainelMode = 'senha' | 'nome' | 'ambos'

interface LiveCall {
  id: string
  ticket: string
  counter: string
  patientName: string | null
  priority: boolean
  at: Date
}

/** Tempo de silêncio entre uma repetição e outra da MESMA chamada. */
const REPEAT_GAP_MS = 2_000

interface Options {
  enabled: boolean
  mode: PainelMode
  call: LiveCall | null
  queue: AudioQueue
  deviceToken: string | null
  voiceId?: string | null
  /** Quantas vezes repetir a chamada inteira (cada frase é cacheada;
   *  repetir = enfileirar N vezes com 2s entre). Default 1. */
  repeatCount?: number
  /** Chamado se o TTS falhar totalmente e precisar cair no fallback. */
  onFallback?: (call: LiveCall) => void
  /** Chamado quando o anúncio (com todas as repetições) termina.
   *  O componente usa isso pra avançar a fila ``pending`` da store. */
  onDone?: () => void
}

/** Extrai só o número da senha pra ser falado — ignora prefixo de letra.
 *  Ex.: ``R-001`` → ``1``, ``P-047`` → ``47``. Se não casar o padrão,
 *  devolve o ticket inteiro (defensive, quase nunca cai aqui). */
function ticketNumberForSpeech(ticket: string): string {
  const m = ticket.match(/[A-Za-z]*-?0*(\d+)/)
  return m ? m[1] : ticket
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
  const number = ticketNumberForSpeech(call.ticket)
  const useName = (mode === 'nome' || mode === 'ambos') && hasRealName(call.patientName)

  if (mode === 'nome' && useName) {
    phrases.push(call.patientName!)
  } else if (mode === 'ambos' && useName) {
    phrases.push(call.patientName!)
    phrases.push(`Senha ${number}`)
  } else {
    phrases.push(`Senha ${number}`)
  }

  if (call.counter && call.counter.trim()) {
    phrases.push(call.counter)
  }

  return phrases
}

export function usePainelTtsAnnouncer({
  enabled, mode, call, queue, deviceToken, voiceId, repeatCount = 1,
  onFallback, onDone,
}: Options) {
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !call) return
    if (lastIdRef.current === call.id) return
    lastIdRef.current = call.id

    if (!deviceToken) {
      onFallback?.(call)
      onDone?.()
      return
    }

    let cancelled = false

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
        if (cancelled) return
        const urls = resp.audios.map(a => a.url)
        // Constrói [urls..., gap, urls..., gap, urls...] pra repeatCount iter.
        const n = Math.max(1, Math.min(3, repeatCount))
        const items: AudioQueueItem[] = []
        for (let i = 0; i < n; i++) {
          if (i > 0) items.push({ delayMs: REPEAT_GAP_MS })
          items.push(...urls)
        }
        // Aguarda o batch terminar (ou ser abortado por clear()).
        await queue.enqueue(items).catch(() => { /* abortado */ })
      } catch (err) {
        if (!cancelled) {
          if (err instanceof HttpError) {
            console.warn('[tts] /prepare failed; falling back to speech synth:', err.message)
          } else {
            console.warn('[tts] /prepare network error; falling back to speech synth')
          }
          onFallback?.(call)
        }
      } finally {
        // Avança a fila seja sucesso, erro OU abort — evita travar em ``current``.
        if (!cancelled) onDone?.()
      }
    })()

    return () => { cancelled = true }
  }, [enabled, mode, call, queue, deviceToken, voiceId, repeatCount, onFallback, onDone])
}

/** Hook separado pra TTS do silêncio — quando o evento ``painel:silence``
 *  chega, dispara a mensagem via mesma voz. A fila + cache reaproveitam
 *  tudo que já existe. */
export function useSilenceTtsAnnouncer({
  enabled, message, queue, deviceToken, voiceId, silenceAt,
}: {
  enabled: boolean
  message: string
  queue: AudioQueue
  deviceToken: string | null
  voiceId?: string | null
  /** Timestamp vindo do store — muda = disparar nova fala. */
  silenceAt: number | null
}) {
  const lastAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || !silenceAt || !deviceToken || !message.trim()) return
    if (lastAtRef.current === silenceAt) return
    lastAtRef.current = silenceAt

    ;(async () => {
      try {
        const resp = await ttsRuntimeApi.prepare(deviceToken, {
          phrases: [message.trim()],
          voiceId: voiceId ?? null,
        })
        await queue.enqueue(resp.audios.map(a => a.url)).catch(() => {})
      } catch {
        /* sem fallback — o overlay visual já comunicou */
      }
    })()
  }, [enabled, message, queue, deviceToken, voiceId, silenceAt])
}
