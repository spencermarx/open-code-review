/**
 * Thinking entry — collapsed by default.
 *
 * Single-line preview when collapsed (italic, muted), full italic prose
 * when expanded. The collapsed state surfaces the *first non-empty line*
 * of the assembled thinking text so the user can decide whether to
 * expand based on the topic.
 *
 * Thinking is interesting but rarely the user's primary signal —
 * collapsing it reduces feed noise without hiding the content entirely.
 */

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../../../lib/utils'

type ThinkingEntryProps = {
  /** Concatenated thinking_delta text for one thinking block. */
  text: string
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return text.trim()
}

export function ThinkingEntry({ text }: ThinkingEntryProps) {
  const [expanded, setExpanded] = useState(false)
  const preview = firstNonEmptyLine(text)

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          'group flex w-full items-start gap-1.5 text-left text-[13px] italic',
          'text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300',
          'transition-colors',
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-1 h-3 w-3 shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1">
          {expanded ? (
            <span className="block whitespace-pre-wrap leading-relaxed text-zinc-600 dark:text-zinc-400">
              {text}
            </span>
          ) : (
            <span className="line-clamp-1 not-italic text-[12px] tracking-wide text-zinc-400 dark:text-zinc-500">
              <span className="italic">Thinking · </span>
              <span className="italic">{preview}</span>
            </span>
          )}
        </span>
      </button>
    </div>
  )
}
