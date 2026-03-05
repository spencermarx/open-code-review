import { useEffect, useMemo, useRef } from 'react'
import { Square, Sparkles } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface WorkflowOutputProps {
  output: string
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
  isRunning,
  exitCode,
  commandName,
  onCancel,
  bare,
}: WorkflowOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output])

  // Parse output into typed line segments
  const segments = useMemo(() => parseOutput(output), [output])

  const showPanel = output.length > 0 || isRunning

  if (!showPanel) return null

  return (
    <div className={cn(!bare && 'overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800')}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
              </span>
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Running {commandName ?? 'workflow'}...
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Workflow Output
              </span>
            </>
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
                  : 'border-red-500/25 bg-red-500/15 text-red-700 dark:text-red-400',
              )}
            >
              {exitCode === 0 ? 'Complete' : `Exit: ${exitCode}`}
            </span>
          )}
        </div>
      </div>

      {/* Output body */}
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
    </div>
  )
}

// ── Output parsing ──

interface OutputSegment {
  type: 'text' | 'tool' | 'empty'
  text: string
}

function parseOutput(raw: string): OutputSegment[] {
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

    // Regular text — merge with previous text segment if it exists
    // (streaming tokens that form a single paragraph)
    const prev = segments[segments.length - 1]
    if (prev && prev.type === 'text') {
      prev.text += ' ' + trimmed
    } else {
      segments.push({ type: 'text', text: trimmed })
    }
  }

  // Remove trailing empty segment
  if (segments.length > 0 && segments[segments.length - 1]?.type === 'empty') {
    segments.pop()
  }

  return segments
}
