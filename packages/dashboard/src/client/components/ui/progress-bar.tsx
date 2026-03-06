import { cn } from '../../lib/utils'

type ProgressBarProps = {
  value: number
  max: number
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function ProgressBar({
  value,
  max,
  className,
  showLabel = false,
  size = 'md',
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0
  const clampedPercentage = Math.min(100, Math.max(0, percentage))

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${value} of ${max} (${clampedPercentage}%)`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            clampedPercentage === 100
              ? 'bg-emerald-500'
              : clampedPercentage > 50
                ? 'bg-blue-500'
                : 'bg-amber-500',
          )}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {value}/{max}
        </span>
      )}
    </div>
  )
}
