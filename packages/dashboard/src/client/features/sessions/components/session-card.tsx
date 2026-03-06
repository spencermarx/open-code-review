import { Link } from 'react-router-dom'
import { GitBranch, FileSearch, Map, Clock } from 'lucide-react'
import { StatusBadge } from '../../../components/ui/status-badge'
import { formatShortDate, formatElapsed } from '../../../lib/date-utils'
import { cn } from '../../../lib/utils'
import type { SessionSummary } from '../../../lib/api-types'

type SessionCardProps = {
  session: SessionSummary
}

const VERDICT_STYLES: Record<string, string> = {
  'APPROVED': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'LGTM': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'REQUEST CHANGES': 'bg-red-500/15 text-red-700 dark:text-red-400',
  'CHANGES REQUESTED': 'bg-red-500/15 text-red-700 dark:text-red-400',
}

function verdictStyle(verdict: string): string {
  return VERDICT_STYLES[verdict.toUpperCase()] ?? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
}

/** Statuses that indicate the user has addressed the review. */
const RESOLVED_STATUSES = new Set(['changes_made', 'acknowledged', 'dismissed'])

const TRIAGE_LABELS: Record<string, string> = {
  changes_made: 'Changes Made',
  acknowledged: 'Acknowledged',
  dismissed: 'Dismissed',
}

export function SessionCard({ session }: SessionCardProps) {
  const hasBoth = session.has_review && session.has_map
  const workflowLabel = hasBoth
    ? 'Review + Map'
    : session.has_map ? 'Map' : 'Review'

  // Show the primary workflow's phase in the card
  const displayPhase = session.has_review
    ? session.review_phase
    : session.map_phase
  const phaseLabel = displayPhase
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  // Determine if the latest review round has been triaged as resolved
  const roundStatus = session.latest_round_status
  const isResolved = roundStatus != null && RESOLVED_STATUSES.has(roundStatus)

  return (
    <Link
      to={`/sessions/${session.id}`}
      className="group block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {session.branch}
          </span>
        </div>
        <StatusBadge variant={session.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1">
          {session.has_review && <FileSearch className="h-3.5 w-3.5" />}
          {session.has_map && <Map className="h-3.5 w-3.5" />}
          <span>{workflowLabel}</span>
        </span>
        <span className="text-zinc-300 dark:text-zinc-700">|</span>
        {session.latest_verdict ? (
          <span className="flex items-center gap-1.5">
            {isResolved ? (
              // Show the triage status instead of the raw verdict
              <span className="inline-flex items-center rounded bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                {TRIAGE_LABELS[roundStatus!] ?? roundStatus}
              </span>
            ) : (
              <>
                <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', verdictStyle(session.latest_verdict))}>
                  {session.latest_verdict}
                </span>
                {session.latest_blocker_count > 0 && (
                  <span className="inline-flex items-center rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">
                    {session.latest_blocker_count} blocker{session.latest_blocker_count !== 1 ? 's' : ''}
                  </span>
                )}
              </>
            )}
          </span>
        ) : (
          <span>Phase: {phaseLabel}</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
        <span>{formatShortDate(session.started_at)}</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatElapsed(session.updated_at)}
        </span>
      </div>
    </Link>
  )
}
