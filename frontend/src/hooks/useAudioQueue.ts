// Fila sequencial de áudios pra o painel/totem.
//
// Garantias:
// - Items enqueued durante reprodução entram no FIM (não cortam).
// - ``clear()`` interrompe e zera a fila (pra silêncio, etc.); qualquer
//   Promise devolvida por ``enqueue()`` que ainda não tinha resolvido é
//   rejeitada (o caller usa isso pra saber que foi abortado).
// - ``enqueue(items)`` retorna Promise que resolve quando TODOS os items
//   daquela chamada terminaram (seja URL tocando ou delay expirando).
// - Cada item pode ser uma URL (string) OU um delay ({ delayMs: N }),
//   útil pra silêncio entre repetições.
//
// Usa 1 ``HTMLAudioElement`` reusado. Essencial pra iOS Safari: o
// desbloqueio de autoplay via gesture é POR ELEMENTO.

import { useCallback, useEffect, useMemo, useRef } from 'react'

export type AudioQueueItem = string | { delayMs: number }

export interface UseAudioQueueOptions {
  volume?: number
  onDrain?: () => void
  onError?: (url: string, err: unknown) => void
}

export interface AudioQueue {
  enqueue: (items: AudioQueueItem[]) => Promise<void>
  clear: () => void
  isPlaying: () => boolean
  size: () => number
  prime: () => void
}

interface InternalItem {
  url?: string
  delayMs?: number
  /** Resolve + reject só no ÚLTIMO item do batch — é a forma do enqueue
   *  prometer "acabou essa chamada". */
  resolver?: () => void
  rejector?: (err: Error) => void
}

export function useAudioQueue(opts: UseAudioQueueOptions = {}): AudioQueue {
  const { volume = 1, onDrain, onError } = opts
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<InternalItem[]>([])
  const currentItemRef = useRef<InternalItem | null>(null)
  const delayTimerRef = useRef<number | null>(null)
  const playingRef = useRef(false)
  const aliveRef = useRef(true)
  // Token incrementado a cada play — listener de play antigo compara
  // antes de avançar, evita double-shift via play().catch + error event.
  const playTokenRef = useRef(0)
  const onDrainRef = useRef(onDrain)
  const onErrorRef = useRef(onError)
  onDrainRef.current = onDrain
  onErrorRef.current = onError

  useEffect(() => {
    const el = new Audio()
    el.volume = volume
    el.preload = 'auto'
    audioRef.current = el
    aliveRef.current = true

    return () => {
      aliveRef.current = false
      try { el.pause() } catch { /* ignore */ }
      el.src = ''
      audioRef.current = null
      if (delayTimerRef.current !== null) {
        window.clearTimeout(delayTimerRef.current)
        delayTimerRef.current = null
      }
      const err = new Error('audio queue unmounted')
      currentItemRef.current?.rejector?.(err)
      for (const it of queueRef.current) it.rejector?.(err)
      currentItemRef.current = null
      queueRef.current = []
      playingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const finishItem = useCallback((success: boolean, errUrl?: string, err?: unknown) => {
    const cur = currentItemRef.current
    currentItemRef.current = null
    if (!cur) return
    if (!success && errUrl) onErrorRef.current?.(errUrl, err)
    // Resolve independente do sucesso — o batch "terminou" mesmo se
    // uma frase falhou no meio (o fluxo avança pro próximo).
    cur.resolver?.()
  }, [])

  const processNext = useCallback(() => {
    const el = audioRef.current
    if (!el || !aliveRef.current) return
    const next = queueRef.current.shift()
    if (!next) {
      playingRef.current = false
      onDrainRef.current?.()
      return
    }
    playingRef.current = true
    currentItemRef.current = next

    if (next.delayMs !== undefined) {
      delayTimerRef.current = window.setTimeout(() => {
        delayTimerRef.current = null
        finishItem(true)
        if (aliveRef.current) processNext()
      }, next.delayMs)
      return
    }

    const url = next.url!
    const token = ++playTokenRef.current

    // Reseta antes de setar nova src. Sem isso, URLs iguais em sequência
    // (``repeat_count > 1``) viram no-op — o browser não dispara ``ended``.
    try { el.pause() } catch { /* ignore */ }
    el.removeAttribute('src')
    el.load()
    el.src = url

    el.play().catch(err => {
      if (token !== playTokenRef.current) return
      finishItem(false, url, err)
      if (aliveRef.current) processNext()
    })
  }, [finishItem])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onEnded = () => {
      if (!aliveRef.current) return
      finishItem(true)
      processNext()
    }
    const onErr = () => {
      // Ignora o ruído de ``removeAttribute('src') + load()`` que fazemos
      // entre items (dispara ``error`` num src vazio).
      if (!el.src || el.src === window.location.href) return
      if (!aliveRef.current) return
      finishItem(false, el.currentSrc || el.src, new Error('audio load error'))
      processNext()
    }
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onErr)
    return () => {
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onErr)
    }
  }, [processNext, finishItem])

  const enqueue = useCallback((items: AudioQueueItem[]): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      if (items.length === 0) { resolve(); return }
      const internal: InternalItem[] = items.map((it, i) => {
        const last = i === items.length - 1
        const base: InternalItem = last ? { resolver: resolve, rejector: reject } : {}
        if (typeof it === 'string') base.url = it
        else base.delayMs = it.delayMs
        return base
      })
      queueRef.current.push(...internal)
      if (!playingRef.current) processNext()
    })
  }, [processNext])

  const clear = useCallback(() => {
    playTokenRef.current++
    if (delayTimerRef.current !== null) {
      window.clearTimeout(delayTimerRef.current)
      delayTimerRef.current = null
    }
    const err = new Error('audio queue cleared')
    currentItemRef.current?.rejector?.(err)
    for (const it of queueRef.current) it.rejector?.(err)
    currentItemRef.current = null
    queueRef.current = []
    const el = audioRef.current
    if (el) {
      try { el.pause() } catch { /* ignore */ }
      el.removeAttribute('src')
      el.load()
    }
    playingRef.current = false
  }, [])

  const isPlaying = useCallback(() => playingRef.current, [])
  const size = useCallback(
    () => queueRef.current.length + (playingRef.current ? 1 : 0),
    [],
  )

  const prime = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
    el.muted = true
    el.src = SILENT_WAV
    const p = el.play()
    Promise.resolve(p).then(() => {
      el.pause()
      el.currentTime = 0
      el.removeAttribute('src')
      el.load()
      el.muted = false
    }).catch(() => {
      el.muted = false
    })
  }, [])

  return useMemo(
    () => ({ enqueue, clear, isPlaying, size, prime }),
    [enqueue, clear, isPlaying, size, prime],
  )
}
