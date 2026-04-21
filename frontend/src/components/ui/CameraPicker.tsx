import { useEffect, useState } from 'react'
import { Camera, Check, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  /** Permite destacar o device atualmente selecionado. */
  selectedId?: string | null
  /** Invocado quando o usuário escolhe uma câmera. */
  onSelect: (deviceId: string, label: string) => void
}

/**
 * Lista de câmeras disponíveis. Requer permissão de câmera previamente
 * concedida pra mostrar labels decentes — caso contrário os nomes vêm
 * como "camera 1", "camera 2".
 *
 * Pra garantir permissão, este componente faz um `getUserMedia` rápido
 * e libera logo em seguida, só pra destravar os labels do enumerateDevices.
 */
export function CameraPicker({ selectedId, onSelect }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 1. Dispara permissão rápida pra destravar os labels.
        let permStream: MediaStream | null = null
        try {
          permStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        } finally {
          permStream?.getTracks().forEach(t => t.stop())
        }
        // 2. Enumera.
        const list = await navigator.mediaDevices.enumerateDevices()
        if (!alive) return
        setDevices(list.filter(d => d.kind === 'videoinput'))
      } catch (err) {
        if (!alive) return
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Permissão da câmera negada.'
            : 'Não foi possível listar as câmeras.',
        )
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 size={15} className="animate-spin" />
        Procurando câmeras...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 text-sm text-rose-600 dark:text-rose-400">
        <AlertCircle size={15} className="shrink-0 mt-0.5" />
        <p>{error}</p>
      </div>
    )
  }

  if (devices.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Nenhuma câmera encontrada.
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {devices.map((d, i) => {
        const isSelected = selectedId === d.deviceId
        return (
          <button
            key={d.deviceId || i}
            type="button"
            onClick={() => onSelect(d.deviceId, d.label || `Câmera ${i + 1}`)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
              isSelected
                ? 'border-primary bg-primary/10'
                : 'border-border hover:bg-muted',
            )}
          >
            <Camera size={15} className="text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm truncate">
              {d.label || `Câmera ${i + 1}`}
            </span>
            {isSelected && <Check size={14} className="text-primary shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
