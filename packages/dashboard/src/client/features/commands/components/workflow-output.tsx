import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal, Square, Sparkles, Users } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { StreamEvent } from '../../../lib/api-types'
import { EventStreamRenderer } from './event-stream/event-stream-renderer'

/**
 * Parses an `ocr review --team <json> --requirements ...` command into a
 * friendly summary suitable for the workflow header. Returns the verb
 * (e.g. "review") and a structured reviewer-count chip.
 *
 * Hides the avalanche of `--team [{...},{...}]` JSON noise that was
 * previously dumped into the header — the raw command is always one
 * click away via the "Raw" toggle.
 */
function parseCommandSummary(command: string | null): {
  verb: string
  reviewerCount: number | null
} {
  if (!command) return { verb: 'workflow', reviewerCount: null }
  const cleaned = command.replace(/^ocr\s+/, '')
  const verb = cleaned.split(/\s+/)[0] ?? 'workflow'
  // Try to extract --team <json>. The team arg may include nested
  // braces; we stop at the next `--flag` or end of string.
  const teamMatch = cleaned.match(/--team\s+(\[[\s\S]*?\])(?=\s+--|\s*$)/)
  let reviewerCount: number | null = null
  if (teamMatch?.[1]) {
    try {
      const team = JSON.parse(teamMatch[1])
      if (Array.isArray(team)) reviewerCount = team.length
    } catch {
      // Malformed JSON — leave count null, the user just sees the verb.
    }
  }
  return { verb, reviewerCount }
}

type WorkflowOutputProps = {
  /**
   * Legacy human-readable summary stream — used when `events` is empty
   * (utility commands, executions before the events feature).
   */
  output: string
  /**
   * Typed event stream from the AI CLI adapter. When non-empty, renders
   * via the new timeline. When empty, falls through to the legacy
   * line-parser path.
   */
  events?: StreamEvent[]
  isRunning: boolean
  exitCode: number | null
  commandName: string | null
  onCancel: () => void
  bare?: boolean
}

/**
 * AI workflow output renderer.
 *
 * Parses the accumulated output string into typed lines (text vs tool activity)
 * and renders them with appropriate styling — prose text with proper word-wrap,
 * tool activity as compact muted status indicators.
 */
export function WorkflowOutput({
  output,
  events,
  isRunning,
  exitCode,
  commandName,
  onCancel,
  bare,
}: WorkflowOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showRaw, setShowRaw] = useState(false)

  // Auto-scroll the legacy output viewer to bottom on new output.
  // The timeline renderer manages its own sticky-scroll behavior.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output])

  // Parse output into typed line segments (legacy view only)
  const segments = useMemo(() => parseOutput(output), [output])

  const showPanel = output.length > 0 || (events && events.length > 0) || isRunning
  const hasTimeline = !!events && events.length > 0

  // Friendly command summary: verb + reviewer count chip. Replaces the
  // previous "Running ocr review --team [{...long JSON...}] --requirements ..."
  // dump that wrapped to two lines and read like a debug log. Raw view
  // is one click away.
  const summary = useMemo(() => parseCommandSummary(commandName), [commandName])

  if (!showPanel) return null

  return (
    <div className={cn(!bare && 'overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800')}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex min-w-0 items-center gap-2">
          {isRunning ? (
            <>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
              </span>
              <span className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Running <span className="capitalize">{summary.verb}</span>
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                <span className="capitalize">{summary.verb}</span> output
              </span>
            </>
          )}
          {summary.reviewerCount != null && summary.reviewerCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              <Users className="h-2.5 w-2.5" aria-hidden />
              {summary.reviewerCount} reviewer
              {summary.reviewerCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                'border-zinc-300 text-zinc-600 hover:bg-zinc-100',
                'dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800',
              )}
            >
              <Square className="h-2.5 w-2.5" />
              Cancel
            </button>
          )}
          {exitCode !== null && (
            <span
              className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                exitCode === 0
                  ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : exitCode === -2
                    ? 'border-amber-500/25 bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    : 'border-red-500/25 bg-red-500/15 text-red-700 dark:text-red-400',
              )}
            >
              {exitCode === 0 ? 'Complete' : exitCode === -2 ? 'Cancelled' : `Exit: ${exitCode}`}
            </span>
          )}
          {hasTimeline && (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                'border-zinc-300 text-zinc-500 hover:bg-zinc-100',
                'dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800',
              )}
              title={showRaw ? 'Show timeline' : 'Show raw output'}
            >
              <MoreHorizontal aria-hidden className="h-3 w-3" />
              {showRaw ? 'Timeline' : 'Raw'}
            </button>
          )}
        </div>
      </div>

      {/* Output body */}
      {hasTimeline && !showRaw ? (
        // `flex flex-col` plus a definite max-height creates a concrete
        // height envelope for the renderer's inner scroll container to
        // fill via flex-1. Without flex here, the renderer's overflow
        // would never activate because every parent height is content-
        // driven up to max-h, and the inner h-full chain has nothing to
        // resolve to.
        <div className="flex max-h-[600px] min-h-[120px] flex-col bg-white dark:bg-zinc-950">
          <EventStreamRenderer
            events={events!}
            isRunning={isRunning}
            className="min-h-0 flex-1"
          />
        </div>
      ) : (
      <div
        ref={scrollRef}
        className="max-h-[600px] min-h-[120px] overflow-y-auto bg-white px-5 py-4 dark:bg-zinc-950"
      >
        {segments.length === 0 && isRunning ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="h-1 w-1 animate-pulse rounded-full bg-zinc-400" />
            Waiting for output...
          </div>
        ) : (
          segments.map((segment, i) => {
            if (segment.type === 'tool') {
              return (
                <div
                  key={i}
                  className="my-1 flex items-center gap-1.5 border-l-2 border-indigo-400/40 py-0.5 pl-2.5 font-mono text-xs text-zinc-400 dark:text-zinc-500"
                >
                  <span className="shrink-0 text-indigo-400/70">▸</span>
                  <span className="truncate">{segment.text}</span>
                </div>
              )
            }

            if (segment.type === 'empty') {
              return <div key={i} className="h-3" />
            }

            // Text content — prose with proper wrapping
            // Detect markdown headers for appropriate styling
            const headingMatch = segment.text.match(/^(#{1,6})\s+(.+)/)
            if (headingMatch) {
              const level = headingMatch[1].length
              const text = headingMatch[2]
              const sizeClass = level <= 2 ? 'text-base font-semibold' : level <= 4 ? 'text-sm font-semibold' : 'text-sm font-medium'
              return (
                <div key={i} className={cn(sizeClass, 'mt-3 mb-1 text-zinc-800 dark:text-zinc-200')}>
                  {text}
                </div>
              )
            }

            // Detect list items
            if (/^[-*+]\s/.test(segment.text) || /^\d+\.\s/.test(segment.text)) {
              return (
                <div key={i} className="ml-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {segment.text}
                </div>
              )
            }

            return (
              <div
                key={i}
                className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
              >
                {segment.text}
              </div>
            )
          })
        )}

        {/* Streaming cursor */}
        {isRunning && segments.length > 0 && (
          <span className="inline-block h-4 w-0.5 animate-pulse bg-indigo-500" />
        )}
      </div>
      )}
    </div>
  )
}

// ── Output parsing ──

type OutputSegment = {
  type: 'text' | 'tool' | 'empty'
  text: string
}

export function parseOutput(raw: string): OutputSegment[] {
  if (!raw) return []

  const lines = raw.split('\n')
  const segments: OutputSegment[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '') {
      // Collapse consecutive empty segments
      if (segments.length > 0 && segments[segments.length - 1]?.type !== 'empty') {
        segments.push({ type: 'empty', text: '' })
      }
      continue
    }

    // Tool activity line (starts with ▸)
    if (trimmed.startsWith('▸')) {
      segments.push({ type: 'tool', text: trimmed.replace(/^▸\s*/, '') })
      continue
    }

    // Regular text
    // Preserve lines that start with markdown structural characters
    // (headers, lists, code fences, blockquotes, horizontal rules)
    const isStructural = /^(#{1,6}\s|[-*+]\s|\d+\.\s|```|>\s|---|\*\*\*|___)/.test(trimmed)

    if (isStructural) {
      segments.push({ type: 'text', text: trimmed })
    } else {
      // Merge with previous text segment (streaming tokens forming a paragraph)
      const prev = segments[segments.length - 1]
      if (prev && prev.type === 'text') {
        prev.text += ' ' + trimmed
      } else {
        segments.push({ type: 'text', text: trimmed })
      }
    }
  }

  // Remove trailing empty segment
  if (segments.length > 0 && segments[segments.length - 1]?.type === 'empty') {
    segments.pop()
  }

  return segments
}
