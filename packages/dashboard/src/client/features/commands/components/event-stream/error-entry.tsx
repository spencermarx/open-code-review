/**
 * Error entry — always expanded, always loud.
 *
 * Errors don't collapse because the user needs to see what went wrong
 * without an extra click. Source distinguishes `agent` (the AI itself
 * raised an error) from `process` (the AI subprocess died/stderr).
 */

import { AlertCircle, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../../../lib/utils'

type ErrorEntryProps = {
  source: 'agent' | 'process'
  message: string
  detail?: string
}

export function ErrorEntry({ source, message, detail }: ErrorEntryProps) {
  const [copied, setCopied] = useState(false)
  const fullText = detail ? `${message}\n\n${detail}` : message

  const handleCopy = (): void => {
    navigator.clipboard.writeText(fullText).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {
        /* clipboard write failed — silently no-op */
      },
    )
  }

  return (
    <div
      className={cn(
        'my-1 rounded-md border px-3 py-2',
        'border-red-300 bg-red-50 dark:border-red-800/60 dark:bg-red-950/30',
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
              {source === 'agent' ? 'Agent error' : 'Process error'}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-700 transition-colors hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Copy aria-hidden className="h-3 w-3" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1 text-[13px] font-medium text-red-800 dark:text-red-200">
            {message}
          </p>
          {detail && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-red-700/80 dark:text-red-300/80">
              {detail}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
