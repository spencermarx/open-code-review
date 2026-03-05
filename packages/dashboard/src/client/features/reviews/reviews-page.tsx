import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Filter, FileText } from 'lucide-react'
import { cn } from '../../lib/utils'
import { StatusBadge } from '../../components/ui/status-badge'
import { SortableHeader } from '../../components/ui/sortable-header'
import { useAllReviews, useUpdateRoundStatus } from './hooks/use-reviews'
import type { RoundTriage } from '../../lib/api-types'

type SortField = 'session_id' | 'round_number' | 'verdict' | 'blocker_count' | 'status'
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<RoundTriage, number> = {
  needs_review: 0,
  in_progress: 1,
  changes_made: 2,
  acknowledged: 3,
  dismissed: 4,
}

const ROUND_STATUS_OPTIONS: { value: RoundTriage; label: string }[] = [
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'changes_made', label: 'Changes Made' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'dismissed', label: 'Dismissed' },
]

const STATUS_FILTER_OPTIONS: { value: RoundTriage | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  ...ROUND_STATUS_OPTIONS,
]

export function ReviewsPage() {
  const { data: rounds, isLoading } = useAllReviews()
  const updateStatus = useUpdateRoundStatus()
  const navigate = useNavigate()

  const [showAll, setShowAll] = useState(false)
  const [statusFilter, setStatusFilter] = useState<RoundTriage | 'all'>('all')
  const [verdictFilter, setVerdictFilter] = useState<string | 'all'>('all')
  const [sortField, setSortField] = useState<SortField>('status')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const verdictOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = [{ value: 'all', label: 'All Verdicts' }]
    for (const r of rounds ?? []) {
      if (r.verdict && !seen.has(r.verdict)) {
        seen.add(r.verdict)
        opts.push({ value: r.verdict, label: r.verdict })
      }
    }
    return opts
  }, [rounds])

  const filtered = useMemo(() => {
    let result = rounds ?? []

    if (!showAll) {
      result = result.filter((r) => {
        const status = r.progress?.status ?? 'needs_review'
        return status === 'needs_review' || status === 'in_progress'
      })
    }

    if (statusFilter !== 'all') {
      result = result.filter((r) => (r.progress?.status ?? 'needs_review') === statusFilter)
    }

    if (verdictFilter !== 'all') {
      result = result.filter((r) => r.verdict === verdictFilter)
    }

    return result
  }, [rounds, showAll, statusFilter, verdictFilter])

  const sorted = useMemo(() => {
    const multiplier = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'session_id':
          return a.session_id.localeCompare(b.session_id) * multiplier
        case 'round_number':
          return (a.round_number - b.round_number) * multiplier
        case 'verdict':
          return (a.verdict ?? '').localeCompare(b.verdict ?? '') * multiplier
        case 'blocker_count':
          return (a.blocker_count - b.blocker_count) * multiplier
        case 'status': {
          const sa = STATUS_ORDER[a.progress?.status ?? 'needs_review']
          const sb = STATUS_ORDER[b.progress?.status ?? 'needs_review']
          return (sa - sb) * multiplier
        }
        default:
          return 0
      }
    })
  }, [filtered, sortField, sortDir])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function handleStatusChange(roundId: number, status: RoundTriage) {
    updateStatus.mutate({ roundId, status })
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll(false)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              !showAll
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            Actionable
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              showAll
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            All
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">Loading reviews...</p>
      ) : !rounds || rounds.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          No review rounds found. Run <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">ocr review</code> to create one.
        </p>
      ) : (
        <div className="mt-6">
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-zinc-400" />
            {showAll && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as RoundTriage | 'all')}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Verdict:</span>
              <select
                value={verdictFilter}
                onChange={(e) => setVerdictFilter(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                {verdictOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {sorted.length} of {(rounds ?? []).length} reviews
            </span>
          </div>

          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No reviews match your filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <SortableHeader
                      label="Branch"
                      field="session_id"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Round"
                      field="round_number"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Verdict"
                      field="verdict"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Blockers"
                      field="blocker_count"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <th className="border-b border-zinc-200 px-4 py-2 text-left font-medium text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
                      Reviewers
                    </th>
                    <SortableHeader
                      label="Status"
                      field="status"
                      activeField={sortField}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((round) => {
                    const branch = round.session_id.replace(/^\d{4}-\d{2}-\d{2}-/, '')
                    const reviewerCount = (round.reviewer_outputs ?? []).length

                    return (
                      <tr
                        key={`${round.session_id}-${round.round_number}`}
                        className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        onClick={() => navigate(`/sessions/${round.session_id}/reviews/${round.round_number}`)}
                      >
                        <td className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                            <span className="truncate text-zinc-900 dark:text-zinc-100" title={round.session_id}>
                              {branch}
                            </span>
                          </div>
                        </td>
                        <td className="border-b border-zinc-200 px-4 py-2 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                          Round {round.round_number}
                        </td>
                        <td className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
                          {round.verdict ? (
                            <StatusBadge
                              variant={
                                round.verdict === 'APPROVE'
                                  ? 'info'
                                  : round.verdict === 'REQUEST CHANGES'
                                    ? 'high'
                                    : 'medium'
                              }
                              label={round.verdict}
                            />
                          ) : (
                            <span className="text-xs text-zinc-400">Pending</span>
                          )}
                        </td>
                        <td className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
                          {round.blocker_count > 0 ? (
                            <span className="inline-flex items-center rounded-md border border-red-500/25 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                              {round.blocker_count}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">0</span>
                          )}
                        </td>
                        <td className="border-b border-zinc-200 px-4 py-2 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                          {reviewerCount}
                        </td>
                        <td
                          className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={round.progress?.status ?? 'needs_review'}
                            onChange={(e) => handleStatusChange(round.id, e.target.value as RoundTriage)}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            {ROUND_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
