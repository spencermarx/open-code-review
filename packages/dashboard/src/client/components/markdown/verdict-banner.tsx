import { CheckCircle2, XCircle, MessageCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

type Verdict = 'APPROVE' | 'REQUEST CHANGES' | 'NEEDS DISCUSSION'

type VerdictBannerProps = {
  verdict: Verdict
  blockerCount?: number
  suggestionCount?: number
  shouldFixCount?: number
  className?: string
}

const VERDICT_CONFIG: Record<
  Verdict,
  { icon: typeof CheckCircle2; bg: string; border: string; text: string; label: string }
> = {
  APPROVE: {
    icon: CheckCircle2,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    label: 'Approved',
  },
  'REQUEST CHANGES': {
    icon: XCircle,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-700 dark:text-red-400',
    label: 'Changes Requested',
  },
  'NEEDS DISCUSSION': {
    icon: MessageCircle,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-700 dark:text-amber-400',
    label: 'Needs Discussion',
  },
}

export function VerdictBanner({
  verdict,
  blockerCount,
  suggestionCount,
  shouldFixCount,
  className,
}: VerdictBannerProps) {
  const config = VERDICT_CONFIG[verdict]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border p-4',
        config.bg,
        config.border,
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn('h-6 w-6', config.text)} />
        <span className={cn('text-lg font-semibold', config.text)}>
          {config.label}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm">
        {blockerCount != null && (
          <Stat
            label="Blockers"
            value={blockerCount}
            className={blockerCount > 0 ? 'text-red-600 dark:text-red-400' : undefined}
          />
        )}
        {shouldFixCount != null && (
          <Stat
            label="Should Fix"
            value={shouldFixCount}
            className={shouldFixCount > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
          />
        )}
        {suggestionCount != null && (
          <Stat label="Suggestions" value={suggestionCount} />
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'font-semibold tabular-nums',
          className ?? 'text-zinc-700 dark:text-zinc-300',
        )}
      >
        {value}
      </span>
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
  )
}
