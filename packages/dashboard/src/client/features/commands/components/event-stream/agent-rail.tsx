/**
 * Per-agent left-rail provenance.
 *
 * The renderer wraps each entry in an AgentRail keyed by agentId. The rail
 * is a thin colored vertical bar pinned to the entry's left edge; the
 * agent's name appears in the gutter only on the FIRST entry of each
 * contiguous run (i.e., when the previous entry was from a different
 * agent). The visual idiom borrows from threaded chat clients and IDE
 * gutter highlights — quiet enough to recede, distinct enough to glance.
 *
 * Color is a stable hash of agentId mod a small palette so two reviewers
 * (e.g. principal-1 and principal-2) get consistent and visually distinct
 * rails across reloads. The palette is hand-tuned for both light and dark
 * modes so the text + rail combination stays readable.
 */

import type { ReactNode } from 'react'
import { cn } from '../../../../lib/utils'

type AgentRailProps = {
  agentId: string
  /** Whether to render the agent's name in the gutter for this entry. */
  showName: boolean
  /** Display name for the gutter label — falls back to agentId. */
  displayName?: string
  children: ReactNode
}

// Palette of rail colors. Each entry pairs a Tailwind border color with a
// faint background tint and a gutter text color. Hand-picked so adjacent
// rails are distinguishable in both light + dark mode.
const PALETTE = [
  {
    border: 'border-l-indigo-400 dark:border-l-indigo-500',
    bg: 'bg-indigo-50/30 dark:bg-indigo-950/15',
    text: 'text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-500',
  },
  {
    border: 'border-l-emerald-400 dark:border-l-emerald-500',
    bg: 'bg-emerald-50/30 dark:bg-emerald-950/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  {
    border: 'border-l-amber-400 dark:border-l-amber-500',
    bg: 'bg-amber-50/30 dark:bg-amber-950/15',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  {
    border: 'border-l-sky-400 dark:border-l-sky-500',
    bg: 'bg-sky-50/30 dark:bg-sky-950/15',
    text: 'text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  {
    border: 'border-l-rose-400 dark:border-l-rose-500',
    bg: 'bg-rose-50/30 dark:bg-rose-950/15',
    text: 'text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  {
    border: 'border-l-violet-400 dark:border-l-violet-500',
    bg: 'bg-violet-50/30 dark:bg-violet-950/15',
    text: 'text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
] as const

const ORCHESTRATOR_COLOR = {
  border: 'border-l-zinc-300 dark:border-l-zinc-700',
  bg: 'bg-transparent',
  text: 'text-zinc-600 dark:text-zinc-400',
  dot: 'bg-zinc-400 dark:bg-zinc-500',
} as const

/**
 * Stable hash of a string into a non-negative integer. Used to map
 * agentId → palette index so the same reviewer always gets the same color.
 */
function hashAgentId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function getAgentColor(agentId: string): typeof PALETTE[number] | typeof ORCHESTRATOR_COLOR {
  if (agentId === 'orchestrator') return ORCHESTRATOR_COLOR
  return PALETTE[hashAgentId(agentId) % PALETTE.length]!
}

/**
 * Format an agentId into a human-readable display label.
 * Orchestrator is shown without a name (the rail itself is the signal).
 */
export function formatAgentDisplayName(agentId: string): string {
  if (agentId === 'orchestrator') return 'Orchestrator'
  return agentId
}

export function AgentRail({ agentId, showName, displayName, children }: AgentRailProps) {
  const color = getAgentColor(agentId)
  const label = displayName ?? formatAgentDisplayName(agentId)

  return (
    <div className={cn('relative pl-4', color.bg)}>
      {/* The rail itself — a 2px colored left border. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-[2px]',
          color.border.replace('border-l-', 'bg-'),
        )}
      />
      {showName && (
        <div
          className={cn(
            'mb-1 flex items-center gap-1.5 text-[11px] font-medium',
            color.text,
          )}
        >
          <span
            aria-hidden
            className={cn('inline-block h-1.5 w-1.5 rounded-full', color.dot)}
          />
          {label}
        </div>
      )}
      <div>{children}</div>
    </div>
  )
}
