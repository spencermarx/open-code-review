import { CheckCircle2, XCircle, MessageCircle, HelpCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

type VerdictBannerProps = {
  /** Free-form verdict string from the parser. May be a known label
   *  (`APPROVE`, `REQUEST CHANGES`, `NEEDS DISCUSSION`) or an unfamiliar
   *  phrasing — the banner falls back to a neutral style for unknowns
   *  rather than crashing. */
  verdict: string
  blockerCount?: number
  suggestionCount?: number
  shouldFixCount?: number
  className?: string
}

type VerdictConfig = {
  icon: typeof CheckCircle2
  bg: string
  border: string
  text: string
  label: string
}

const VERDICT_CONFIG: Record<string, VerdictConfig> = {
  APPROVE: {
    icon: CheckCircle2,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    label: 'Approved',
  },
  APPROVED: {
    icon: CheckCircle2,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    label: 'Approved',
  },
  LGTM: {
    icon: CheckCircle2,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    label: 'LGTM',
  },
  'REQUEST CHANGES': {
    icon: XCircle,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-700 dark:text-red-400',
    label: 'Changes Requested',
  },
  'CHANGES REQUESTED': {
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
  'NEEDS WORK': {
    icon: MessageCircle,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-700 dark:text-amber-400',
    label: 'Needs Work',
  },
}

const UNKNOWN_VERDICT_CONFIG: VerdictConfig = {
  icon: HelpCircle,
  bg: 'bg-zinc-500/10',
  border: 'border-zinc-500/30',
  text: 'text-zinc-700 dark:text-zinc-300',
  label: 'Verdict',
}

/**
 * Resolves the verdict config. Tolerates verdicts that haven't been
 * normalized yet (legacy rows from before the parser whitelist landed) —
 * if the raw string starts with a known keyword we treat it as that
 * keyword, otherwise we fall back to a neutral "Verdict" badge with the
 * raw text as the label.
 */
function resolveConfig(verdict: string): VerdictConfig {
  const trimmed = verdict.trim()
  const upper = trimmed.toUpperCase()
  if (VERDICT_CONFIG[upper]) return VERDICT_CONFIG[upper]
  for (const [key, cfg] of Object.entries(VERDICT_CONFIG)) {
    if (upper.startsWith(key)) return cfg
  }
  // Show the raw verdict text as the label for unknown phrasings, but
  // cap at 60 chars so a paragraph-long verdict doesn't blow out the
  // banner layout.
  const label = trimmed.length > 60 ? `${trimmed.slice(0, 60).trim()}…` : trimmed
  return { ...UNKNOWN_VERDICT_CONFIG, label: label || 'Verdict' }
}

export function VerdictBanner({
  verdict,
  blockerCount,
  suggestionCount,
  shouldFixCount,
  className,
}: VerdictBannerProps) {
  const config = resolveConfig(verdict)
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
