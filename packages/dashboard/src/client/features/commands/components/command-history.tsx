import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  History,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatDateTime, formatDuration } from '../../../lib/date-utils'
import { useCommandHistory, type CommandHistoryEntry } from '../hooks/use-commands'

// ── Types ──

type StatusFilter = 'all' | 'success' | 'fail' | 'cancelled' | 'running'
type SortField = 'date' | 'command' | 'duration' | 'status'
type SortDir = 'asc' | 'desc'

// ── Fuzzy match helper ──

/**
 * Simple fuzzy match: every character of the query must appear in order
 * within the target string (case-insensitive). Returns true if matched.
 */
function fuzzyMatch(target: string, query: string): boolean {
  const lower = target.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi]!, ti)
    if (idx < 0) return false
    ti = idx + 1
  }
  return true
}

// ── Status helpers ──

function getStatus(entry: CommandHistoryEntry): StatusFilter {
  if (entry.exit_code === null) return 'running'
  if (entry.exit_code === 0) return 'success'
  if (entry.exit_code === -2) return 'cancelled'
  return 'fail'
}

function statusLabel(s: StatusFilter): string {
  switch (s) {
    case 'success': return 'Success'
    case 'fail': return 'Fail'
    case 'cancelled': return 'Cancelled'
    case 'running': return 'Running'
    default: return 'All'
  }
}

// ── Sort comparator ──

function compareEntries(a: CommandHistoryEntry, b: CommandHistoryEntry, field: SortField, dir: SortDir): number {
  let cmp = 0
  switch (field) {
    case 'date':
      cmp = new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      break
    case 'command':
      cmp = a.command.localeCompare(b.command)
      break
    case 'duration':
      cmp = (a.duration_ms ?? -1) - (b.duration_ms ?? -1)
      break
    case 'status': {
      const order: Record<StatusFilter, number> = { running: 0, success: 1, cancelled: 2, fail: 3, all: -1 }
      cmp = (order[getStatus(a)] ?? 0) - (order[getStatus(b)] ?? 0)
      break
    }
  }
  return dir === 'asc' ? cmp : -cmp
}

// ── Status filter chips ──

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'fail', label: 'Fail' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'running', label: 'Running' },
]

// ── Sub-components ──

function SortButton({
  label,
  field,
  activeField,
  dir,
  onToggle,
}: {
  label: string
  field: SortField
  activeField: SortField
  dir: SortDir
  onToggle: (field: SortField) => void
}) {
  const isActive = field === activeField
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={cn(
        'inline-flex items-center gap-1 text-xs transition-colors',
        isActive
          ? 'font-medium text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300',
      )}
    >
      {label}
      {isActive ? (
        dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}

/** Commands that can be meaningfully re-run from the command center. */
const RERUNNABLE_COMMANDS = new Set(['map', 'review'])

function isRerunnable(command: string): boolean {
  const base = command.replace(/^ocr\s+/, '').split(/\s+/)[0] ?? ''
  return RERUNNABLE_COMMANDS.has(base)
}

function HistoryItem({
  entry,
  isRunning,
  onRerun,
}: {
  entry: CommandHistoryEntry
  isRunning: boolean
  onRerun: (command: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isComplete = entry.exit_code !== null
  const canRerun = isComplete && isRerunnable(entry.command)

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
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{formatDateTime(entry.started_at)}</span>
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
          {statusLabel(getStatus(entry))}
        </span>
        {canRerun && (
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

// ── Main component ──

type CommandHistoryProps = {
  isRunning: boolean
  onRerun: (command: string) => void
}

export function CommandHistory({ isRunning, onRerun }: CommandHistoryProps) {
  const { data: history, isLoading } = useCommandHistory()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const toggleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortDir(field === 'date' ? 'desc' : 'asc')
    }
  }

  const filtered = useMemo(() => {
    if (!history) return []
    let items = history

    // Status filter
    if (statusFilter !== 'all') {
      items = items.filter((e) => getStatus(e) === statusFilter)
    }

    // Fuzzy search across command + args
    if (searchQuery.trim()) {
      const q = searchQuery.trim()
      items = items.filter((e) => {
        const haystack = e.command + (e.args ? ' ' + e.args : '')
        return fuzzyMatch(haystack, q)
      })
    }

    // Sort
    return [...items].sort((a, b) => compareEntries(a, b, sortField, sortDir))
  }, [history, statusFilter, searchQuery, sortField, sortDir])

  // Count by status for the chip badges
  const statusCounts = useMemo(() => {
    if (!history) return {} as Record<StatusFilter, number>
    const counts: Record<string, number> = { all: history.length, success: 0, fail: 0, cancelled: 0, running: 0 }
    for (const e of history) counts[getStatus(e)]!++
    return counts as Record<StatusFilter, number>
  }, [history])

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

  const hasHistory = history && history.length > 0

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <History className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <span className="text-sm font-medium">Command History</span>
        {hasHistory && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {filtered.length === history.length
              ? `${history.length}`
              : `${filtered.length} / ${history.length}`}
          </span>
        )}
      </div>

      {/* Toolbar — search, status filter, sort */}
      {hasHistory && (
        <div className="space-y-2 border-b border-zinc-200 bg-zinc-50/50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
          {/* Search bar */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search commands..."
              className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status chips + sort controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Status filter chips */}
            <div className="flex flex-wrap items-center gap-1">
              {STATUS_OPTIONS.map((opt) => {
                const count = statusCounts[opt.value] ?? 0
                if (opt.value !== 'all' && count === 0) return null
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatusFilter(opt.value)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                      statusFilter === opt.value
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700',
                    )}
                  >
                    {opt.label}
                    <span className={cn(
                      'tabular-nums',
                      statusFilter === opt.value
                        ? 'text-zinc-300 dark:text-zinc-400'
                        : 'text-zinc-400 dark:text-zinc-500',
                    )}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Sort controls */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Sort</span>
              <SortButton label="Date" field="date" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
              <SortButton label="Command" field="command" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
              <SortButton label="Duration" field="duration" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
              <SortButton label="Status" field="status" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!hasHistory ? (
        <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No commands have been run yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No commands match your filters.
        </div>
      ) : (
        filtered.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} isRunning={isRunning} onRerun={onRerun} />
        ))
      )}
    </div>
  )
}
