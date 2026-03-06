import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, User } from 'lucide-react'
import { useReviewerDetail } from './hooks/use-reviews'
import { MarkdownRenderer } from '../../components/markdown/markdown-renderer'
import { FindingsTable } from './components/findings-table'
import { useQuery } from '@tanstack/react-query'
import type { Artifact } from '../../lib/api-types'
import { fetchApi } from '../../lib/utils'
import { REVIEWER_ICONS } from './constants'

export function ReviewerDetailPage() {
  const {
    id: sessionId,
    round: roundStr,
    reviewerId: reviewerIdStr,
  } = useParams<{
    id: string
    round: string
    reviewerId: string
  }>()

  const roundNumber = parseInt(roundStr ?? '0', 10)
  const reviewerId = parseInt(reviewerIdStr ?? '0', 10)

  const { data: reviewer, isLoading } = useReviewerDetail(
    sessionId ?? '',
    roundNumber,
    reviewerId,
  )

  // Fetch the raw markdown content for this reviewer's file
  // The reviewer output has a file_path; we load it as an artifact-like content
  // Since reviewer outputs are stored as individual files, we read via a dedicated endpoint
  // For now, we use the reviewer output content from the detail response if available
  const contentQuery = useQuery<string>({
    queryKey: ['reviewer-content', sessionId, roundNumber, reviewerId],
    queryFn: async () => {
      if (!reviewer?.file_path) return ''
      try {
        const data = await fetchApi<Artifact>(
          `/api/sessions/${sessionId}/rounds/${roundNumber}/reviewers/${reviewerId}/content`,
        )
        return data.content ?? ''
      } catch {
        return ''
      }
    },
    enabled: !!reviewer?.file_path,
  })

  if (isLoading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading reviewer...</p>
  }

  if (!reviewer) {
    return (
      <div>
        <Link
          to={`/sessions/${sessionId}/reviews/${roundNumber}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to round
        </Link>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Reviewer not found.</p>
      </div>
    )
  }

  const Icon = REVIEWER_ICONS[reviewer.reviewer_type] ?? User

  return (
    <div className="space-y-6">
      <Link
        to={`/sessions/${sessionId}/reviews/${roundNumber}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to round {roundNumber}
      </Link>

      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 text-zinc-500" />
        <div>
          <h1 className="text-2xl font-semibold capitalize">
            {reviewer.reviewer_type}
            {reviewer.instance_number > 1 && (
              <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                #{reviewer.instance_number}
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {reviewer.finding_count} finding
            {reviewer.finding_count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Rendered Markdown Output */}
      {contentQuery.data && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Reviewer Output
          </h2>
          <MarkdownRenderer content={contentQuery.data} />
        </div>
      )}

      {/* Findings from this reviewer */}
      {reviewer.findings.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Findings ({reviewer.findings.length})
          </h2>
          <FindingsTable findings={reviewer.findings} />
        </div>
      )}
    </div>
  )
}
