import { Link } from 'react-router-dom'
import { GitBranch, FileSearch, Map, Clock } from 'lucide-react'
import { StatusBadge } from '../../../components/ui/status-badge'
import { parseUtcDate } from '../../../lib/utils'
import type { SessionSummary } from '../../../lib/api-types'

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - parseUtcDate(startedAt).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatDate(dateStr: string): string {
  return parseUtcDate(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface SessionCardProps {
  session: SessionSummary
}

export function SessionCard({ session }: SessionCardProps) {
  const WorkflowIcon = session.workflow_type === 'map' ? Map : FileSearch

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

      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1">
          <WorkflowIcon className="h-3.5 w-3.5" />
          <span className="capitalize">{session.workflow_type}</span>
        </span>
        <span className="text-zinc-300 dark:text-zinc-700">|</span>
        <span>Phase: {session.current_phase.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
        <span>{formatDate(session.started_at)}</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatElapsed(session.updated_at)}
        </span>
      </div>
    </Link>
  )
}
