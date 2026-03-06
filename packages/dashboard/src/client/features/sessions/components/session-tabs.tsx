import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSearch, Map, Loader2 } from 'lucide-react'
import { cn, fetchApi } from '../../../lib/utils'
import { useSocketEvent } from '../../../providers/socket-provider'
import { StatusBadge } from '../../../components/ui/status-badge'
import type { SessionSummary, ReviewRound, MapRun, SessionStatus } from '../../../lib/api-types'

type SessionTabsProps = {
  session: SessionSummary
}

type Tab = 'review' | 'map'

export function SessionTabs({ session }: SessionTabsProps) {
  const hasReview = session.has_review
  const hasMap = session.has_map

  const defaultTab: Tab = hasReview ? 'review' : 'map'
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab)

  const tabs: { id: Tab; label: string; icon: typeof FileSearch; visible: boolean }[] = [
    { id: 'review', label: 'Review', icon: FileSearch, visible: hasReview },
    { id: 'map', label: 'Map', icon: Map, visible: hasMap },
  ]

  const visibleTabs = tabs.filter((t) => t.visible)

  if (visibleTabs.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No review or map data yet.
      </p>
    )
  }

  return (
    <div>
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300',
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {activeTab === 'review' && (
          <ReviewTabContent sessionId={session.id} status={session.status} />
        )}
        {activeTab === 'map' && (
          <MapTabContent sessionId={session.id} status={session.status} />
        )}
      </div>
    </div>
  )
}

function ReviewTabContent({ sessionId, status }: { sessionId: string; status: SessionStatus }) {
  const queryClient = useQueryClient()

  // Refresh when artifacts are created/updated (reviewer outputs, final.md)
  useSocketEvent('artifact:created', () => {
    queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'rounds'] })
  })
  useSocketEvent('artifact:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'rounds'] })
  })

  const { data: rounds, isLoading } = useQuery<ReviewRound[]>({
    queryKey: ['sessions', sessionId, 'rounds'],
    queryFn: () => fetchApi<ReviewRound[]>(`/api/sessions/${sessionId}/rounds`),
    enabled: !!sessionId,
  })

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading rounds...
      </p>
    )
  }

  if (!rounds || rounds.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {status === 'closed'
          ? 'This session was closed without completing any review rounds.'
          : 'Review in progress — no completed rounds yet.'}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {rounds.map((round) => (
        <Link
          key={round.round_number}
          to={`/sessions/${sessionId}/reviews/${round.round_number}`}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
        >
          <FileSearch className="h-4 w-4 text-zinc-400" />
          <span className="text-zinc-900 dark:text-zinc-100">Round {round.round_number}</span>
          <div className="ml-auto flex items-center gap-2">
            {round.progress && (
              <StatusBadge variant={round.progress.status} />
            )}
            {round.verdict && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{round.verdict}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function MapTabContent({ sessionId, status }: { sessionId: string; status: SessionStatus }) {
  const queryClient = useQueryClient()

  // Refresh when map artifacts are created/updated
  useSocketEvent('artifact:created', () => {
    queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'runs'] })
  })
  useSocketEvent('artifact:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'runs'] })
  })

  const { data: runs, isLoading } = useQuery<MapRun[]>({
    queryKey: ['sessions', sessionId, 'runs'],
    queryFn: () => fetchApi<MapRun[]>(`/api/sessions/${sessionId}/runs`),
    enabled: !!sessionId,
  })

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading runs...
      </p>
    )
  }

  if (!runs || runs.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {status === 'closed'
          ? 'This session was closed without completing any map runs.'
          : 'Map in progress — no completed runs yet.'}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <Link
          key={run.run_number}
          to={`/sessions/${sessionId}/maps/${run.run_number}`}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
        >
          <Map className="h-4 w-4 text-zinc-400" />
          <span className="text-zinc-900 dark:text-zinc-100">Run {run.run_number}</span>
        </Link>
      ))}
    </div>
  )
}
