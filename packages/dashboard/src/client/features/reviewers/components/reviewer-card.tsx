import { FileText } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { ReviewerIcon } from '../../commands/components/reviewer-icon'
import type { ReviewerMeta } from '../../commands/hooks/use-reviewers'

const TIER_BADGE: Record<string, { label: string; className: string } | undefined> & {
  custom: { label: string; className: string }
} = {
  holistic: {
    label: 'Generalist',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  },
  specialist: {
    label: 'Specialist',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  },
  persona: {
    label: 'Persona',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  },
  custom: {
    label: 'Custom',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  },
}

type ReviewerCardProps = {
  reviewer: ReviewerMeta
  onViewPrompt: (id: string) => void
  /**
   * Count of this reviewer's instances in the resolved default team.
   * When > 0, replaces the binary "Default" badge with "In default team ×N".
   */
  inDefaultTeamCount?: number
}

export function ReviewerCard({ reviewer, onViewPrompt, inDefaultTeamCount }: ReviewerCardProps) {
  const badge = TIER_BADGE[reviewer.tier] ?? TIER_BADGE.custom
  const teamCount = inDefaultTeamCount ?? (reviewer.is_default ? 1 : 0)

  return (
    <div className="group flex flex-col rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      {/* Header */}
      <div className="mb-2 flex items-start gap-3">
        <ReviewerIcon
          icon={reviewer.icon}
          className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {reviewer.name}
            </h3>
            {teamCount > 0 && (
              <span
                className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                title="Reviewer is part of the workspace's default team"
              >
                {teamCount > 1 ? `In default team ×${teamCount}` : 'In default team'}
              </span>
            )}
          </div>
          <span
            className={cn(
              'mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              badge.className,
            )}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        {reviewer.description}
      </p>

      {/* Known for (persona only) */}
      {reviewer.known_for && (
        <p className="mb-2 text-[11px] italic text-zinc-400 dark:text-zinc-500">
          Known for: {reviewer.known_for}
        </p>
      )}

      {/* Focus areas */}
      {reviewer.focus_areas.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {reviewer.focus_areas.slice(0, 4).map((area) => (
            <span
              key={area}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {area}
            </span>
          ))}
          {reviewer.focus_areas.length > 4 && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              +{reviewer.focus_areas.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto pt-1">
        <button
          type="button"
          onClick={() => onViewPrompt(reviewer.id)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <FileText className="h-3 w-3" />
          View Prompt
        </button>
      </div>
    </div>
  )
}
