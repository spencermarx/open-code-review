/**
 * Tool entry — one row showing tool name + load-bearing arg + status.
 *
 * Collapsed: `🔧 Read · src/db/migrations.ts ✓`
 * Expanded: full input JSON + tool result output (when available).
 *
 * Status icon transitions:
 *   pending  · gray dot
 *   running  ⟳ spinning indigo
 *   done     ✓ emerald check
 *   error    ✗ red x
 */

import { useState } from 'react'
import { Check, ChevronRight, CircleAlert, Loader2, Wrench, X } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import {
  selectToolSummary,
  selectToolSummaryFallback,
} from './tool-summary-selectors'

type ToolStatus = 'pending' | 'running' | 'done' | 'error'

type ToolEntryProps = {
  name: string
  toolId: string
  input: Record<string, unknown>
  /** Streaming partial JSON appended after tool_call (Claude only). */
  inputPartial?: string
  /** Output text from tool_result — undefined while still running. */
  output?: string
  status: ToolStatus
}

export function ToolEntry({
  name,
  input,
  inputPartial,
  output,
  status,
}: ToolEntryProps) {
  const [expanded, setExpanded] = useState(false)
  const summary = selectToolSummary(name, input) ?? selectToolSummaryFallback(input)

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          'group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left',
          'transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'h-3 w-3 shrink-0 text-zinc-400 transition-transform dark:text-zinc-500',
            expanded && 'rotate-90',
          )}
        />
        <Wrench
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400"
        />
        <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
          {name}
        </span>
        {summary && (
          <>
            <span className="text-zinc-400 dark:text-zinc-600">·</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-600 dark:text-zinc-400">
              {summary}
            </span>
          </>
        )}
        {!summary && <span className="flex-1" />}
        <StatusIcon status={status} />
      </button>

      {expanded && (
        <div className="ml-7 mt-1 space-y-2">
          {/* Input */}
          <ExpandedSection label="Input">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-zinc-100 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {formatInput(input, inputPartial)}
            </pre>
          </ExpandedSection>

          {/* Output (when finished) */}
          {output !== undefined && (
            <ExpandedSection label={status === 'error' ? 'Error output' : 'Output'}>
              <pre
                className={cn(
                  'overflow-x-auto whitespace-pre-wrap break-words rounded-md px-3 py-2 font-mono text-[11px] leading-relaxed',
                  status === 'error'
                    ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
                )}
              >
                {output || '(empty)'}
              </pre>
            </ExpandedSection>
          )}
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === 'running') {
    return (
      <Loader2
        aria-label="Running"
        className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-500 dark:text-indigo-400"
      />
    )
  }
  if (status === 'done') {
    return (
      <Check
        aria-label="Done"
        className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
      />
    )
  }
  if (status === 'error') {
    return (
      <X
        aria-label="Error"
        className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400"
      />
    )
  }
  return (
    <CircleAlert
      aria-label="Pending"
      className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
    />
  )
}

function ExpandedSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  )
}

/**
 * Render the tool input as pretty-printed JSON. If a streaming partial
 * exists (Claude in the middle of typing), append it raw — the user can
 * see what's still arriving even if it's malformed JSON.
 */
function formatInput(
  input: Record<string, unknown>,
  partial?: string,
): string {
  let base: string
  try {
    base = JSON.stringify(input, null, 2)
  } catch {
    base = '{}'
  }
  if (!partial) return base
  // The partial may not be valid JSON — present it as a raw appendix so
  // the user sees the typing in progress rather than a sanitized view.
  return `${base}\n\n// streaming…\n${partial}`
}
