// Fila sequencial de áudios pra o painel/totem.
//
// Garantias:
// - Chamadas enqueued durante reprodução entram no fim (não cortam).
// - ``clear()`` interrompe o atual e zera a fila (pra silêncio, etc.).
// - ``enqueue()`` é fire-and-forget; retorna imediatamente.
// - Sem vazamento de blobs / listeners (cleanup no unmount).
//
// Internamente usa 1 ``HTMLAudioElement`` reusado. Web Audio daria mais
// controle, mas HTMLAudioElement é mais simples e funciona pra MP3.

import { useCallback, useEffect, useRef } from 'react'

export interface UseAudioQueueOptions {
  /** Volume 0..1. Default 1. */
  volume?: number
  /** Callback quando toda a fila esvazia (útil pra métricas). */
  onDrain?: () => void
  /** Callback quando um áudio falha (pra logar). */
  onError?: (url: string, err: unknown) => void
}

export interface AudioQueue {
  /** Adiciona URLs no fim da fila. Se nada estiver tocando, começa. */
  enqueue: (urls: string[]) => void
  /** Para imediatamente e esvazia a fila. */
  clear: () => void
  /** true enquanto algo está tocando. */
  isPlaying: () => boolean
  /** Número de URLs pendentes + o atual. */
  size: () => number
}

export function useAudioQueue(opts: UseAudioQueueOptions = {}): AudioQueue {
  const { volume = 1, onDrain, onError } = opts
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  const aliveRef = useRef(true)
  const onDrainRef = useRef(onDrain)
  const onErrorRef = useRef(onError)
  onDrainRef.current = onDrain
  onErrorRef.current = onError

  // Inicializa o <audio> singleton.
  useEffect(() => {
    const el = new Audio()
    el.volume = volume
    el.preload = 'auto'
    audioRef.current = el
    aliveRef.current = true

    return () => {
      aliveRef.current = false
      el.pause()
      el.src = ''
      el.load()
      audioRef.current = null
      queueRef.current = []
      playingRef.current = false
    }
    // volume é controlado no outro effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Avança pro próximo item da fila.
  const playNext = useCallback(() => {
    const el = audioRef.current
    if (!el || !aliveRef.current) return
    const next = queueRef.current.shift()
    if (!next) {
      playingRef.current = false
      onDrainRef.current?.()
      return
    }
    playingRef.current = true
    el.src = next
    el.play().catch(err => {
      onErrorRef.current?.(next, err)
      // Pula pro próximo; não trava a fila.
      if (aliveRef.current) playNext()
    })
  }, [])

  // Quando o áudio atual termina, segue pro próximo.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onEnded = () => {
      if (aliveRef.current) playNext()
    }
    const onErr = () => {
      if (aliveRef.current) {
        onErrorRef.current?.(el.src, new Error('audio load error'))
        playNext()
      }
    }
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onErr)
    return () => {
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onErr)
    }
  }, [playNext])

  const enqueue = useCallback((urls: string[]) => {
    if (!urls.length) return
    queueRef.current.push(...urls)
    if (!playingRef.current) playNext()
  }, [playNext])

  const clear = useCallback(() => {
    queueRef.current = []
    const el = audioRef.current
    if (el) {
      try { el.pause() } catch { /* ignore */ }
      el.currentTime = 0
      el.src = ''
    }
    playingRef.current = false
  }, [])

  const isPlaying = useCallback(() => playingRef.current, [])
  const size = useCallback(
    () => queueRef.current.length + (playingRef.current ? 1 : 0),
    [],
  )

  return { enqueue, clear, isPlaying, size }
}
