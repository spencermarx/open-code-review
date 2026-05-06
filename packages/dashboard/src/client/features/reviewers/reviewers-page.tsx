import { useCallback, useMemo, useState } from 'react'
import { Search, RefreshCw, Plus, ChevronDown, ChevronRight, Loader2, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { TIER_CONFIG, filterReviewers, groupByTier } from '../../lib/reviewer-utils'
import { useReviewers, type ReviewerTier } from '../commands/hooks/use-reviewers'
import { useAiCli } from '../../hooks/use-ai-cli'
import { useSocket, useSocketEvent } from '../../providers/socket-provider'
import { ReviewerCard } from './components/reviewer-card'
import { DefaultTeamSection } from './components/default-team-section'
import { useResolvedTeam } from '../commands/hooks/use-team'
import { PromptViewerSheet } from './components/prompt-viewer-sheet'
import { CreateReviewerDialog } from './components/create-reviewer-dialog'

export function ReviewersPage() {
  const { reviewers, isLoaded } = useReviewers()
  const { isAvailable: aiAvailable } = useAiCli()
  const { socket } = useSocket()
  const { data: resolvedTeam } = useResolvedTeam()

  // Aggregate instance counts per persona for the badge on each reviewer card
  const teamCountByPersona = useMemo(() => {
    const map: Record<string, number> = {}
    for (const inst of resolvedTeam?.team ?? []) {
      map[inst.persona] = (map[inst.persona] ?? 0) + 1
    }
    return map
  }, [resolvedTeam])

  const [search, setSearch] = useState('')
  const [collapsedTiers, setCollapsedTiers] = useState<Set<ReviewerTier>>(new Set())
  const [viewingPrompt, setViewingPrompt] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)

  // Filter + group
  const filtered = useMemo(() => filterReviewers(reviewers, search), [reviewers, search])
  const grouped = useMemo(() => groupByTier(filtered), [filtered])

  // Find the reviewer being viewed
  const viewingReviewer = viewingPrompt
    ? reviewers.find((r) => r.id === viewingPrompt) ?? null
    : null

  function toggleTier(tier: ReviewerTier) {
    setCollapsedTiers((prev) => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }

  const syncing = syncingId !== null

  // Track sync command by execution_id
  useSocketEvent<{ execution_id: number; command: string }>('command:started', (evt) => {
    if (evt.command.startsWith('sync-reviewers')) {
      setSyncingId(evt.execution_id)
    }
  })
  useSocketEvent<{ execution_id: number; exitCode: number }>('command:finished', (evt) => {
    if (evt.execution_id === syncingId) {
      setSyncingId(null)
    }
  })

  const handleSync = useCallback(() => {
    if (!socket || syncing) return
    socket.emit('command:run', { command: 'sync-reviewers' })
  }, [socket, syncing])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Review Team</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={!aiAvailable || syncing}
              title={!aiAvailable ? 'AI CLI required' : 'Sync reviewer metadata'}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                'border-zinc-300 text-zinc-600 hover:bg-zinc-100',
                'dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={!aiAvailable}
              title={!aiAvailable ? 'AI CLI required to create reviewers' : 'Create a new reviewer'}
              className={cn(
                'flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors',
                'hover:bg-indigo-700',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Reviewer
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your AI reviewer personas.
        </p>
      </div>

      {/* Default team — workspace baseline composition + per-instance models */}
      <DefaultTeamSection />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reviewers..."
          className={cn(
            'w-full rounded-lg border py-2.5 pl-9 pr-4 text-sm',
            'border-zinc-200 bg-zinc-50 placeholder:text-zinc-400',
            'dark:border-zinc-800 dark:bg-zinc-900 dark:placeholder:text-zinc-500',
            'focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50',
          )}
        />
      </div>

      {/* Content */}
      {!isLoaded ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading reviewers...</p>
      ) : reviewers.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <Users className="mx-auto mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            No reviewers found
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Click <strong>Sync</strong> above or run{' '}
            <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
              /ocr:sync-reviewers
            </code>{' '}
            from your IDE to populate your reviewer team.
          </p>
        </div>
      ) : grouped.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
          No reviewers match your search.
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([tier, items]) => {
            const isCollapsed = collapsedTiers.has(tier)
            const config = TIER_CONFIG[tier]

            return (
              <div key={tier}>
                {/* Tier header */}
                <button
                  type="button"
                  onClick={() => toggleTier(tier)}
                  className="mb-3 flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {config.label}
                  <span className="font-normal text-zinc-300 dark:text-zinc-600">
                    ({items.length})
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((reviewer) => (
                      <ReviewerCard
                        key={reviewer.id}
                        reviewer={reviewer}
                        onViewPrompt={setViewingPrompt}
                        inDefaultTeamCount={teamCountByPersona[reviewer.id] ?? 0}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Prompt Viewer Sheet */}
      <PromptViewerSheet
        reviewer={viewingReviewer}
        onClose={() => setViewingPrompt(null)}
      />

      {/* Create Reviewer Dialog */}
      <CreateReviewerDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  )
}
