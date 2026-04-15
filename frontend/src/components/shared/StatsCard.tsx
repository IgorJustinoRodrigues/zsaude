import { cn } from '../../lib/utils'

interface Props {
  label: string
  value: number | string
  icon: React.ReactNode
  color?: string
  delta?: number
  deltaLabel?: string
  className?: string
}

export function StatsCard({ label, value, icon, color = 'text-primary', delta, deltaLabel, className }: Props) {
  return (
    <div className={cn('bg-white rounded-xl border border-border p-5 flex items-start gap-4', className)}>
      <div className={cn('p-2.5 rounded-lg bg-muted', color)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {delta !== undefined && (
          <p className={cn('text-xs mt-1', delta >= 0 ? 'text-emerald-600' : 'text-red-500')}>
            {delta >= 0 ? '+' : ''}{delta} {deltaLabel}
          </p>
        )}
      </div>
    </div>
  )
}
