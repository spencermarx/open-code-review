import { useState } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { ChatToolStatus } from '../../../lib/api-types'

type AgentActivityProps = {
  currentStatus: ChatToolStatus | null
  history: ChatToolStatus[]
}

const COLLAPSED_LIMIT = 3

export function AgentActivity({ currentStatus, history }: AgentActivityProps) {
  const [expanded, setExpanded] = useState(false)

  // Completed = all history items except the current one
  const completed = currentStatus
    ? history.filter((h) => h.timestamp !== currentStatus.timestamp)
    : history

  const showCollapseToggle = completed.length > COLLAPSED_LIMIT
  const visibleCompleted = expanded ? completed : completed.slice(-COLLAPSED_LIMIT)
  const hiddenCount = completed.length - visibleCompleted.length

  if (!currentStatus && completed.length === 0) return null

  return (
    <div className="space-y-1">
      {/* Completed tool steps */}
      {completed.length > 0 && (
        <div className="space-y-0.5">
          {showCollapseToggle && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {expanded ? 'Collapse' : `${hiddenCount} more step${hiddenCount !== 1 ? 's' : ''}`}
            </button>
          )}

          {visibleCompleted.map((step, i) => (
            <div
              key={step.timestamp + i}
              className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500"
            >
              <Check className="h-3 w-3 flex-shrink-0 text-emerald-500" />
              <span className="truncate">{step.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* Current active tool */}
      {currentStatus && (
        <div
          className={cn(
            'flex items-center gap-1.5 text-[11px] font-medium',
            'text-indigo-600 dark:text-indigo-400',
          )}
        >
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
          </span>
          <span className="truncate">{currentStatus.detail}</span>
        </div>
      )}
    </div>
  )
}
