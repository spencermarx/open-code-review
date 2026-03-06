import { cn } from '../../lib/utils'
import type { SessionStatus, FindingTriage, FindingSeverity, RoundTriage } from '../../../shared/types'

type BadgeVariant = SessionStatus | FindingTriage | FindingSeverity | RoundTriage | 'default'

const variantStyles: Record<BadgeVariant, string> = {
  // Session status
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
  closed: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25',
  // Finding triage
  unread: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25',
  read: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25',
  acknowledged: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25',
  fixed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
  wont_fix: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25',
  // Round triage
  needs_review: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25',
  in_progress: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25',
  changes_made: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
  dismissed: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25',
  // Finding severity
  critical: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/25',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25',
  low: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25',
  info: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25',
  // Default
  default: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25',
}

const LABELS: Partial<Record<BadgeVariant, string>> = {
  wont_fix: "Won't Fix",
  needs_review: 'Needs Review',
  in_progress: 'In Progress',
  changes_made: 'Changes Made',
}

type StatusBadgeProps = {
  variant: BadgeVariant
  label?: string
  className?: string
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const displayLabel = label ?? LABELS[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant] ?? variantStyles.default,
        className,
      )}
    >
      {displayLabel}
    </span>
  )
}
