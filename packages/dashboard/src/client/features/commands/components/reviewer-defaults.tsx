import { X, Settings2, PenLine } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { ReviewerIcon } from './reviewer-icon'
import type { ReviewerMeta } from '../hooks/use-reviewers'

export type ReviewerSelection = {
  id: string
  count: number
  /** When present, this is an ephemeral reviewer (description-only, not persisted). */
  description?: string
  /**
   * Optional per-instance model overrides for this run. Length must equal `count`.
   * Each entry is either a vendor-native model id or `null` (no override; let
   * the host CLI's default apply). Omitted entirely when the user hasn't
   * customized models — disk default applies.
   */
  models?: (string | null)[]
}

type ReviewerDefaultsProps = {
  reviewers: ReviewerMeta[]
  selection: ReviewerSelection[]
  isLoaded: boolean
  disabled: boolean
  onRemove: (id: string) => void
  onCustomize: () => void
}

export function ReviewerDefaults({
  reviewers,
  selection,
  isLoaded,
  disabled,
  onRemove,
  onCustomize,
}: ReviewerDefaultsProps) {
  if (!isLoaded) {
    return (
      <div className="flex items-center gap-3">
        <label className="w-28 shrink-0 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Reviewers
        </label>
        <div className="flex h-8 items-center text-xs text-zinc-400 dark:text-zinc-500">
          Loading...
        </div>
      </div>
    )
  }

  if (reviewers.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <label className="w-28 shrink-0 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Reviewers
        </label>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Run <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">/ocr:sync-reviewers</code> to customize your review team
        </p>
      </div>
    )
  }

  // Separate library and ephemeral selections
  const librarySelections = selection.filter((s) => !s.description)
  const ephemeralSelections = selection.filter((s) => s.description)

  // Resolve library selections to reviewer objects
  const selectedReviewers = librarySelections
    .map((s) => {
      const reviewer = reviewers.find((r) => r.id === s.id)
      return reviewer ? { ...reviewer, count: s.count } : null
    })
    .filter(Boolean) as (ReviewerMeta & { count: number })[]

  return (
    <div className="flex items-start gap-3">
      <label className="w-28 shrink-0 pt-1.5 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Reviewers
      </label>
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {selectedReviewers.map((r) => (
          <span
            key={r.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
              'border-zinc-200 bg-zinc-50 text-zinc-700',
              'dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
            )}
          >
            <ReviewerIcon icon={r.icon} className="h-3 w-3 text-zinc-400 dark:text-zinc-500" />
            <span className="max-w-[120px] truncate">{r.name}</span>
            {r.count > 1 && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                x{r.count}
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                className="ml-0.5 rounded-full p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                aria-label={`Remove ${r.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}

        {ephemeralSelections.map((s) => (
          <span
            key={s.id}
            title={s.description}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs italic',
              'border-amber-300 bg-amber-50 text-amber-700',
              'dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
            )}
          >
            <PenLine className="h-3 w-3 shrink-0" />
            <span className="max-w-[160px] truncate">{s.description}</span>
            {s.count > 1 && (
              <span className="text-[10px] text-amber-400 dark:text-amber-500">
                x{s.count}
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                className="ml-0.5 rounded-full p-0.5 text-amber-400 hover:bg-amber-200 hover:text-amber-600 dark:text-amber-500 dark:hover:bg-amber-800 dark:hover:text-amber-300"
                aria-label="Remove ephemeral reviewer"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={onCustomize}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs transition-colors',
            'border-zinc-300 text-zinc-500 hover:border-indigo-400 hover:text-indigo-600',
            'dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-indigo-400 dark:hover:text-indigo-400',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Settings2 className="h-3 w-3" />
          Customize...
        </button>
      </div>
    </div>
  )
}
