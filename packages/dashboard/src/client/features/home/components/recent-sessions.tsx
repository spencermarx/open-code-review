import { Link } from 'react-router-dom'
import { GitBranch, Map, FileSearch } from 'lucide-react'
import { StatusBadge } from '../../../components/ui/status-badge'
import type { SessionSummary } from '../../../lib/api-types'

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface RecentSessionsProps {
  sessions: SessionSummary[]
}

export function RecentSessions({ sessions }: RecentSessionsProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No sessions yet. Run a code review or map to get started.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {sessions.map((session) => {
        const WorkflowIcon = session.workflow_type === 'map' ? Map : FileSearch
        return (
          <Link
            key={session.id}
            to={`/sessions/${session.id}`}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
          >
            <GitBranch className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="min-w-0 flex-1 truncate text-zinc-900 dark:text-zinc-100">
              {session.branch}
            </span>
            <WorkflowIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <StatusBadge variant={session.status} />
            <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
              {timeAgo(session.updated_at)}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
