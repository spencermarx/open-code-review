import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, ClipboardCopy, Check, X, ShieldAlert } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useIdeConfig } from '../../../hooks/use-ide-config'
import { useSocket } from '../../../providers/socket-provider'
import { useCommandState } from '../../../providers/command-state-provider'

type AddressFeedbackPopoverProps = {
  sessionId: string
  roundNumber: number
}

function buildFinalPath(sessionId: string, roundNumber: number): string {
  return `.ocr/sessions/${sessionId}/rounds/round-${roundNumber}/final.md`
}

const PORTABLE_PROMPT = (path: string) => `Review the feedback in \`${path}\` and address it following these steps:

1. Read the review in its entirety and parse all feedback into discrete items
2. For each item, read the actual code at the referenced location to corroborate
3. Classify each as: Valid (will address) | Valid (alternative approach) | Invalid (decline with evidence) | Needs Clarification
4. Present a numbered summary of all items with classification before implementing
5. For valid items, implement changes — use sub-agents in parallel where items are independent
6. Report: total items, items addressed, items declined with reasoning

GUARDRAILS: Do NOT blindly accept every piece of feedback. Corroborate against actual code first. If feedback is incorrect, decline with evidence. If the suggested fix is suboptimal, propose a better alternative.`

export function AddressFeedbackPopover({ sessionId, roundNumber }: AddressFeedbackPopoverProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const { data: config } = useIdeConfig()
  const hasAiCli = !!config?.aiCli?.active

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, close])

  const finalPath = buildFinalPath(sessionId, roundNumber)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        <Play className="h-3.5 w-3.5" />
        Address Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={close} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="address-feedback-title"
            tabIndex={-1}
            className="relative z-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <button
              onClick={close}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>

            {hasAiCli ? (
              <RunModeContent
                finalPath={finalPath}
                onClose={close}
              />
            ) : (
              <CopyModeContent
                finalPath={finalPath}
                onClose={close}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── AI CLI available: run the command directly ──

function RunModeContent({
  finalPath,
  onClose,
}: {
  finalPath: string
  onClose: () => void
}) {
  const [notes, setNotes] = useState('')
  const [confirming, setConfirming] = useState(false)
  const { socket } = useSocket()
  const { isRunning } = useCommandState()
  const navigate = useNavigate()

  function buildCommandString(): string {
    const parts = ['ocr address', finalPath]
    if (notes.trim()) {
      parts.push('--requirements', notes.trim())
    }
    return parts.join(' ')
  }

  function handleRun() {
    const command = buildCommandString()
    socket?.emit('command:run', { command })
    onClose()
    navigate('/commands')
  }

  return (
    <div>
      <div className="p-6 pb-0">
        <h3 id="address-feedback-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Address Feedback
        </h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Spawn an AI agent to corroborate, validate, and implement changes from this review.
        </p>
      </div>

      {/* Security notice */}
      <div className="mx-6 mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>This runs an AI agent with full read/write and shell access to your project.</span>
      </div>

      <div className="space-y-4 p-6">
        {/* Review path */}
        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Review
          </label>
          <code className="mt-1 block w-full break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {finalPath}
          </code>
        </div>

        {/* Additional notes */}
        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Additional notes <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Focus on the blockers first, skip style nits..."
            rows={3}
            className={cn(
              'mt-1 w-full rounded-md border px-3 py-2 text-sm',
              'border-zinc-200 bg-zinc-50 placeholder:text-zinc-400',
              'dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500',
              'focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50',
              'resize-none',
            )}
          />
        </div>

        {/* Command preview */}
        <code className="block w-full truncate rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {buildCommandString()}
        </code>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={isRunning}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700',
                isRunning && 'cursor-not-allowed opacity-50',
              )}
            >
              <Play className="h-3.5 w-3.5" />
              Run
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              <Play className="h-3.5 w-3.5" />
              Confirm
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── No AI CLI: copy path + prompt for external tools ──

function CopyModeContent({
  finalPath,
  onClose,
}: {
  finalPath: string
  onClose: () => void
}) {
  const [includePrompt, setIncludePrompt] = useState(true)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const text = includePrompt
      ? PORTABLE_PROMPT(finalPath)
      : finalPath

    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6">
      <h3 id="address-feedback-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Address Feedback
      </h3>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Copy the review path and AI prompt to paste into any AI coding tool
        (Claude Code, Cursor, Windsurf, Copilot, etc.).
      </p>

      <div className="mt-4">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Review path
        </label>
        <code className="mt-1 block w-full break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {finalPath}
        </code>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={includePrompt}
          onChange={(e) => setIncludePrompt(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-500 focus:ring-indigo-400 dark:border-zinc-600"
        />
        Include AI prompt
      </label>

      {includePrompt && (
        <div className="mt-3 max-h-40 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <pre className="whitespace-pre-wrap font-mono leading-relaxed">
            {PORTABLE_PROMPT(finalPath)}
          </pre>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied!
            </>
          ) : (
            <>
              <ClipboardCopy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  )
}
