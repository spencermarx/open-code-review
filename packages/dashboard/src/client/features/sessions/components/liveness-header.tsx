import { Activity, AlertTriangle, CircleSlash, CheckCircle2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { parseUtcDate } from '../../../lib/utils'
import { formatElapsed } from '../../../lib/date-utils'
import type { AgentSessionRow } from '../../../lib/api-types'
import { useAgentSessions, classifyLiveness, type AgentLiveness } from '../hooks/use-agent-sessions'

type LivenessHeaderProps = {
  workflowId: string
}

const STATUS_META: Record<
  AgentLiveness,
  {
    label: string
    icon: typeof Activity
    iconClass: string
    border: string
    bg: string
    descriptor: (lastActivity: string | null) => string
  }
> = {
  running: {
    label: 'Running',
    icon: Activity,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5 dark:bg-emerald-500/10',
    descriptor: (last) =>
      last ? `Last activity ${formatElapsed(last)} ago` : 'Active agent session',
  },
  stalled: {
    label: 'Stalled',
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5 dark:bg-amber-500/10',
    descriptor: (last) =>
      last
        ? `Last activity ${formatElapsed(last)} ago — your AI may have crashed`
        : 'No recent heartbeat',
  },
  orphaned: {
    label: 'Orphaned',
    icon: CircleSlash,
    iconClass: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-300 dark:border-zinc-700',
    bg: 'bg-zinc-100/50 dark:bg-zinc-800/30',
    descriptor: (last) =>
      last ? `Auto-marked after ${formatElapsed(last)} of inactivity` : 'Reclassified by sweep',
  },
  idle: {
    label: 'Idle',
    icon: CheckCircle2,
    iconClass: 'text-zinc-400 dark:text-zinc-500',
    border: 'border-zinc-200 dark:border-zinc-800',
    bg: 'bg-white dark:bg-zinc-900',
    descriptor: () => 'No active agent sessions',
  },
}

export function LivenessHeader({ workflowId }: LivenessHeaderProps) {
  const { data, isLoading } = useAgentSessions(workflowId)

  if (isLoading || !data) return null

  const rows = data.agent_sessions
  if (rows.length === 0) return null

  const { status, newestHeartbeat } = classifyLiveness(rows)
  if (status === 'idle') return null

  const meta = STATUS_META[status]
  const Icon = meta.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3',
        meta.border,
        meta.bg,
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', meta.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {meta.label}
          </span>
          {newestHeartbeat && (
            <span
              className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400"
              title={parseUtcDate(newestHeartbeat).toLocaleString()}
            >
              {parseUtcDate(newestHeartbeat).toLocaleTimeString()}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {meta.descriptor(newestHeartbeat)}
        </p>
        <AgentSessionsSummary rows={rows} />
      </div>
    </div>
  )
}

type AgentSessionsSummaryProps = {
  rows: AgentSessionRow[]
}

function AgentSessionsSummary({ rows }: AgentSessionsSummaryProps) {
  if (rows.length === 0) return null

  // Bucket counts by status for an at-a-glance summary
  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  const order = ['running', 'done', 'orphaned', 'crashed', 'cancelled', 'spawning'] as const
  const visible = order
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`)
    .join(' · ')

  if (!visible) return null

  return (
    <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
      {visible}
    </p>
  )
}
