import { useState } from 'react'
import { ChevronDown, ChevronRight, History, RotateCcw } from 'lucide-react'
import { cn, parseUtcDate } from '../../../lib/utils'
import { useCommandHistory, type CommandHistoryEntry } from '../hooks/use-commands'

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(iso: string): string {
  return parseUtcDate(iso).toLocaleString()
}

interface HistoryItemProps {
  entry: CommandHistoryEntry
  isRunning: boolean
  onRerun: (command: string) => void
}

function HistoryItem({ entry, isRunning, onRerun }: HistoryItemProps) {
  const [expanded, setExpanded] = useState(false)
  const isComplete = entry.exit_code !== null

  return (
    <div className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800">
      <div className="flex w-full items-center gap-3 px-4 py-3 min-w-0">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          )}
          <span className="min-w-0 flex-1 truncate font-mono text-sm">{entry.command}</span>
        </button>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{formatTime(entry.started_at)}</span>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatDuration(entry.duration_ms)}
        </span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium',
            entry.exit_code === 0
              ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : entry.exit_code === -2
                ? 'border-amber-500/25 bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : entry.exit_code !== null
                  ? 'border-red-500/25 bg-red-500/15 text-red-700 dark:text-red-400'
                  : 'border-zinc-500/25 bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
          )}
        >
          {entry.exit_code === null ? 'Running' : entry.exit_code === 0 ? 'Success' : entry.exit_code === -2 ? 'Cancelled' : 'Fail'}
        </span>
        {isComplete && (
          <button
            type="button"
            disabled={isRunning}
            onClick={() => onRerun(entry.command)}
            title="Re-run this command"
            className={cn(
              'shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors',
              'hover:bg-indigo-50 hover:text-indigo-600',
              'dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400',
              isRunning && 'cursor-not-allowed opacity-30',
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {expanded && (
        <pre className="max-h-[300px] overflow-y-auto bg-zinc-950 px-4 py-3 font-mono text-sm leading-relaxed text-zinc-300">
          {entry.output || 'No output recorded.'}
        </pre>
      )}
    </div>
  )
}

interface CommandHistoryProps {
  isRunning: boolean
  onRerun: (command: string) => void
}

export function CommandHistory({ isRunning, onRerun }: CommandHistoryProps) {
  const { data: history, isLoading } = useCommandHistory()

  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <History className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <span className="text-sm font-medium">Command History</span>
        </div>
        <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <History className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <span className="text-sm font-medium">Command History</span>
      </div>
      {!history || history.length === 0 ? (
        <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No commands have been run yet.
        </div>
      ) : (
        history.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} isRunning={isRunning} onRerun={onRerun} />
        ))
      )}
    </div>
  )
}
