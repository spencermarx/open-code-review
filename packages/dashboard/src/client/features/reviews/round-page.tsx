import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { useRound, useRoundFindings, useArtifact } from './hooks/use-reviews'
import { ReviewerCard } from './components/reviewer-card'
import { FindingsTable } from './components/findings-table'
import { VerdictBanner } from '../../components/markdown/verdict-banner'
import {
  DiscourseBlock,
  parseDiscourseContent,
} from '../../components/markdown/discourse-block'
import { MarkdownRenderer } from '../../components/markdown/markdown-renderer'
import { ChatPanel } from '../chat/components/chat-panel'
import { PostReviewDialog } from './components/post-review-dialog'
import { AddressFeedbackPopover } from './components/address-feedback-popover'

export function RoundPage() {
  const { id: sessionId, round: roundStr } = useParams<{
    id: string
    round: string
  }>()
  const roundNumber = parseInt(roundStr ?? '0', 10)

  const { data: round, isLoading } = useRound(sessionId ?? '', roundNumber)
  const { data: findings } = useRoundFindings(sessionId ?? '', roundNumber)

  const { data: finalArtifact } = useArtifact(sessionId ?? '', 'final')
  const { data: finalHumanArtifact } = useArtifact(sessionId ?? '', 'final-human')
  const { data: discourseArtifact } = useArtifact(sessionId ?? '', 'discourse')

  const [showDiscourse, setShowDiscourse] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  if (isLoading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading round...</p>
  }

  if (!round) {
    return (
      <div>
        <Link
          to={`/sessions/${sessionId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to session
        </Link>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Round not found.</p>
      </div>
    )
  }

  const discourseSections = discourseArtifact
    ? parseDiscourseContent(discourseArtifact.content)
    : []

  return (
    <div className="space-y-6">
      <Link
        to={`/sessions/${sessionId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to session
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Round {round.round_number}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {(round.reviewer_outputs ?? []).length} reviewer
            {(round.reviewer_outputs ?? []).length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {finalArtifact && (
            <PostReviewDialog
              sessionId={sessionId ?? ''}
              roundNumber={roundNumber}
              finalContent={finalArtifact.content}
              savedHumanReview={finalHumanArtifact?.content}
            />
          )}
          {finalArtifact && (
            <AddressFeedbackPopover
              sessionId={sessionId ?? ''}
              roundNumber={roundNumber}
            />
          )}
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask the Team
          </button>
        </div>
      </div>

      {/* Verdict Banner */}
      {round.verdict && (
        <VerdictBanner
          verdict={round.verdict as 'APPROVE' | 'REQUEST CHANGES' | 'NEEDS DISCUSSION'}
          blockerCount={round.blocker_count}
          suggestionCount={round.suggestion_count}
          shouldFixCount={round.should_fix_count}
        />
      )}

      {/* Reviewer Cards */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Reviewers
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(round.reviewer_outputs ?? []).map((reviewer) => (
            <ReviewerCard
              key={reviewer.id}
              sessionId={sessionId ?? ''}
              roundNumber={roundNumber}
              reviewer={reviewer}
            />
          ))}
        </div>
      </div>

      {/* Findings Table */}
      {findings && findings.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Findings ({findings.length})
          </h2>
          <FindingsTable findings={findings} />
        </div>
      )}

      {/* Discourse Section */}
      {discourseArtifact && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={() => setShowDiscourse((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-zinc-900 transition-colors hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
          >
            <MessageSquare className="h-4 w-4" />
            {showDiscourse ? 'Hide Discourse' : 'View Discourse'}
          </button>
          {showDiscourse && (
            <div className="mt-4 space-y-4">
              {discourseSections.length > 0
                ? discourseSections.map((section, i) => (
                    <DiscourseBlock
                      key={i}
                      type={section.type}
                      content={section.content}
                      reviewer={section.reviewer}
                    />
                  ))
                : <MarkdownRenderer content={discourseArtifact.content} />
              }
            </div>
          )}
        </div>
      )}

      {/* Final Review Content */}
      {finalArtifact && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Final Review
          </h2>
          <MarkdownRenderer content={finalArtifact.content} />
        </div>
      )}

      {chatOpen && round && (
        <ChatPanel
          sessionId={sessionId ?? ''}
          targetType="review_round"
          targetId={round.round_number}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
