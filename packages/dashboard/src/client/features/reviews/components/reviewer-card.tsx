import { Link } from 'react-router-dom'
import { User } from 'lucide-react'
import type { ReviewerOutput } from '../../../lib/api-types'
import { REVIEWER_ICONS } from '../constants'

const REVIEWER_COLORS: Record<string, string> = {
  principal: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/25',
  quality: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/25',
  security: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
  testing: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
}

type ReviewerCardProps = {
  sessionId: string
  roundNumber: number
  reviewer: ReviewerOutput
}

export function ReviewerCard({ sessionId, roundNumber, reviewer }: ReviewerCardProps) {
  const Icon = REVIEWER_ICONS[reviewer.reviewer_type] ?? User
  const colorClasses =
    REVIEWER_COLORS[reviewer.reviewer_type] ??
    'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/25'

  return (
    <Link
      to={`/sessions/${sessionId}/reviews/${roundNumber}/reviewers/${reviewer.id}`}
      className="group block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg border ${colorClasses}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">
            {reviewer.reviewer_type}
            {reviewer.instance_number > 1 && (
              <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                #{reviewer.instance_number}
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {reviewer.finding_count} finding{reviewer.finding_count !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </Link>
  )
}
