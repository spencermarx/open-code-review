import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, GitBranch, Clock, FileSearch, Map } from 'lucide-react'
import { useSession } from './hooks/use-sessions'
import { useSocketEvent } from '../../providers/socket-provider'
import { StatusBadge } from '../../components/ui/status-badge'
import { PhaseTimeline, type Phase } from '../../components/ui/phase-timeline'
import { SessionTabs } from './components/session-tabs'
import { fetchApi, parseUtcDate } from '../../lib/utils'
import { formatDate } from '../../lib/date-utils'
import type { OrchestrationEvent } from '../../lib/api-types'

// Phase names must match the CLI's `ocr state transition --phase` values exactly.
// Display labels are derived by replacing hyphens with spaces and capitalizing.
const REVIEW_PHASES = [
  'context',
  'change-context',
  'analysis',
  'reviews',
  'aggregation',
  'discourse',
  'synthesis',
  'complete',
]

const MAP_PHASES = [
  'map-context',
  'topology',
  'flow-analysis',
  'requirements-mapping',
  'synthesis',
  'complete',
]

/** Human-readable label from a CLI phase name. */
function phaseLabel(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function buildPhases(
  workflowType: string,
  _currentPhase: string,
  phaseNumber: number,
  status: string,
): Phase[] {
  const phaseNames = workflowType === 'map' ? MAP_PHASES : REVIEW_PHASES
  const totalPhases = phaseNames.length

  // Workflow reached its final phase — all complete, regardless of session status.
  // (The session may still be active because another workflow is in progress.)
  if (phaseNumber >= totalPhases) {
    return phaseNames.map((name) => ({ name: phaseLabel(name), status: 'complete' as const }))
  }

  // Session closed before this workflow finished — show progress + skipped
  if (status === 'closed') {
    return phaseNames.map((name, i) => ({
      name: phaseLabel(name),
      status: i + 1 <= phaseNumber ? 'complete' as const : 'skipped' as const,
    }))
  }

  // Active session, workflow in progress
  return phaseNames.map((name, i) => ({
    name: phaseLabel(name),
    status: i + 1 < phaseNumber
      ? 'complete' as const
      : i + 1 === phaseNumber
        ? 'active' as const
        : 'pending' as const,
  }))
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: session, isLoading } = useSession(id ?? '')

  const eventsQuery = useQuery<OrchestrationEvent[]>({
    queryKey: ['sessions', id, 'events'],
    queryFn: () => fetchApi<OrchestrationEvent[]>(`/api/sessions/${id}/events`),
    enabled: !!id,
  })

  // Refresh events when the DB sync watcher detects new orchestration_events
  useSocketEvent('session:events', () => {
    queryClient.invalidateQueries({ queryKey: ['sessions', id, 'events'] })
  })

  if (isLoading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading session...</p>
  }

  if (!session) {
    return (
      <div>
        <Link
          to="/sessions"
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sessions
        </Link>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Session not found.</p>
      </div>
    )
  }

  const hasBoth = session.has_review && session.has_map
  const workflowLabel = hasBoth
    ? 'Review + Map'
    : session.has_map ? 'Map' : 'Review'

  return (
    <div className="space-y-6">
      <Link
        to="/sessions"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sessions
      </Link>

      {/* Session Header */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-zinc-400" />
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {session.branch}
              </h1>
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                {session.has_review && <FileSearch className="h-4 w-4" />}
                {session.has_map && <Map className="h-4 w-4" />}
                <span>{workflowLabel}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDate(session.started_at)}
              </span>
            </div>
          </div>
          <StatusBadge variant={session.status} />
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Progress
          </h3>
          {hasBoth ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <FileSearch className="h-3.5 w-3.5" />
                  <span>Review</span>
                </div>
                <PhaseTimeline phases={buildPhases('review', session.review_phase, session.review_phase_number, session.status)} />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <Map className="h-3.5 w-3.5" />
                  <span>Map</span>
                </div>
                <PhaseTimeline phases={buildPhases('map', session.map_phase, session.map_phase_number, session.status)} />
              </div>
            </div>
          ) : (
            <PhaseTimeline phases={buildPhases(
              session.has_map ? 'map' : 'review',
              session.has_map ? session.map_phase : session.review_phase,
              session.has_map ? session.map_phase_number : session.review_phase_number,
              session.status,
            )} />
          )}
        </div>
      </div>

      {/* Workflow Tabs */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <SessionTabs session={session} />
      </div>

      {/* Event Log */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Event Log
        </h2>
        {eventsQuery.isLoading ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading events...</p>
        ) : (eventsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No events recorded.</p>
        ) : (
          <div className="space-y-2">
            {(eventsQuery.data ?? []).map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-md px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                  {parseUtcDate(event.created_at).toLocaleTimeString()}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {event.event_type}
                  </span>
                  {event.phase && (
                    <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                      Phase: {event.phase}
                    </span>
                  )}
                  {event.round != null && (
                    <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                      Round: {event.round}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
