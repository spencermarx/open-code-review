import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Terminal, X, AlertCircle, AlertTriangle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useHandoff } from '../hooks/use-agent-sessions'
import type {
  CaptureDiagnostics,
  ResumeOutcome,
} from '../../../lib/api-types'

type TerminalHandoffPanelProps = {
  workflowId: string | null
  onClose: () => void
}

const VENDOR_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
}

function vendorLabelFor(vendor: string | null | undefined): string {
  if (!vendor) return '—'
  return VENDOR_LABELS[vendor] ?? vendor
}

export function TerminalHandoffPanel({ workflowId, onClose }: TerminalHandoffPanelProps) {
  const { data, isLoading, error } = useHandoff(workflowId ?? undefined)
  const dialogRef = useRef<HTMLDivElement>(null)

  // ESC + initial focus
  useEffect(() => {
    if (!workflowId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', handler)
  }, [workflowId, onClose])

  if (!workflowId) return null

  const outcome = data?.outcome
  const headerVendor =
    outcome?.kind === 'resumable'
      ? outcome.vendor
      : outcome?.kind === 'unresumable'
        ? outcome.diagnostics.vendor
        : null
  // `projectDir` lives on the envelope (round-3 Suggestion 4 hoist),
  // not on the outcome arms.
  const headerProjectDir = data?.projectDir ?? null

  // Centered modal rendered through a portal at `document.body`.
  //
  // Portaling is load-bearing here, not cosmetic. The previous in-place
  // render placed this fixed-positioned overlay inside whatever layout
  // container its caller (round-page, command-history, resume-card)
  // happened to use. Tailwind's `space-y-*` and similar utilities
  // apply `margin-bottom` to all-but-last children — including
  // `position: fixed` children. A 24px margin on a fixed `inset-0`
  // element shifts its effective bottom edge up by 24px, leaving a
  // visible gap above the viewport bottom.
  //
  // Rendering at `document.body` decouples the modal from every
  // ancestor's spacing/overflow/transform context. It also escapes
  // stacking contexts so the modal always layers above page content.
  //
  // `max-h-[90vh]` is the right cap here — the modal naturally sizes
  // to its content up to 90% of the viewport, so short outcomes
  // (resumable happy path) don't render as a 95vh slab of mostly-
  // empty space, while long outcomes (diagnostic dumps) still scroll.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="handoff-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl outline-none dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <Terminal className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" />
          <div className="min-w-0 flex-1">
            <h2
              id="handoff-title"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Pick up this review in your terminal
            </h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {outcome ? (
                <>
                  AI CLI: <span className="font-medium">{vendorLabelFor(headerVendor)}</span>
                  {headerProjectDir && (
                    <>
                      <span className="mx-1">·</span>
                      Project: <span className="font-mono">{headerProjectDir}</span>
                    </>
                  )}
                </>
              ) : (
                'Loading…'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading handoff details…</p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Couldn't load handoff details. {error.message}</span>
            </div>
          )}

          {outcome?.kind === 'resumable' && (
            <ResumableBody outcome={outcome} projectDir={data?.projectDir ?? ''} />
          )}

          {outcome?.kind === 'unresumable' && (
            <UnresumableBody outcome={outcome} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Resumable body ──

type ResumableOutcome = Extract<ResumeOutcome, { kind: 'resumable' }>

function ResumableBody({
  outcome,
  projectDir,
}: {
  outcome: ResumableOutcome
  projectDir: string
}) {
  const vendorLabel = vendorLabelFor(outcome.vendor)
  const stepOne = `cd ${projectDir}`
  const stepTwo = outcome.vendorCommand
  const stepTwoLabel = `Resume directly in ${vendorLabel}`

  return (
    <div className="space-y-4">
      <CommandStep
        index={1}
        label="Open the project directory"
        command={stepOne}
        copyAriaLabel="Copy cd command"
      />
      <CommandStep
        index={2}
        label={stepTwoLabel}
        command={stepTwo}
        copyAriaLabel="Copy resume command"
      />

      <div className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <p>
          Requires <span className="font-medium">{vendorLabel}</span> on your{' '}
          <span className="font-mono">$PATH</span>
          {!outcome.hostBinaryAvailable && (
            <>
              {' '}— we couldn't see it from the dashboard. Install it to resume in your terminal.
            </>
          )}
          .
        </p>
      </div>

      <div className="flex justify-end">
        <CopyBothButton commands={[stepOne, stepTwo]} />
      </div>
    </div>
  )
}

// ── Unresumable body — structured failure rendering ──

type UnresumableOutcome = Extract<ResumeOutcome, { kind: 'unresumable' }>

function UnresumableBody({ outcome }: { outcome: UnresumableOutcome }) {
  const { microcopy } = outcome.diagnostics
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{microcopy.headline}</p>
            <p className="text-xs opacity-90">
              <span className="font-medium">Why: </span>
              {microcopy.cause}
            </p>
            <p className="text-xs opacity-90">
              <span className="font-medium">Try: </span>
              {microcopy.remediation}
            </p>
          </div>
        </div>
      </div>

      <DiagnosticsBlock diagnostics={outcome.diagnostics} reason={outcome.reason} />
    </div>
  )
}

function DiagnosticsBlock({
  diagnostics,
  reason,
}: {
  diagnostics: CaptureDiagnostics
  reason: UnresumableOutcome['reason']
}) {
  const [copied, setCopied] = useState(false)
  const text = [
    `reason:                  ${reason}`,
    `vendor:                  ${diagnostics.vendor ?? 'unknown'}`,
    `vendorBinaryAvailable:   ${diagnostics.vendorBinaryAvailable}`,
    `invocationsForWorkflow:  ${diagnostics.invocationsForWorkflow}`,
    `sessionIdEventsObserved: ${diagnostics.sessionIdEventsObserved}`,
  ].join('\n')

  const handleCopy = (): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        /* clipboard unavailable — non-fatal */
      })
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
          Diagnostic data
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy for issue report
            </>
          )}
        </button>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        {text}
      </pre>
    </div>
  )
}

type CommandStepProps = {
  index: number
  label: string
  command: string
  copyAriaLabel: string
}

function CommandStep({ index, label, command, copyAriaLabel }: CommandStepProps) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {index}
        </span>
        <span>{label}</span>
      </div>
      <div className="flex items-stretch gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {command}
        </pre>
        <CopyButton text={command} ariaLabel={copyAriaLabel} />
      </div>
    </div>
  )
}

type CopyButtonProps = {
  text: string
  ariaLabel: string
}

function CopyButton({ text, ariaLabel }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => {
            // Clipboard API failed — surface via aria-live label below
            setCopied(false)
          })
      }}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-2 text-xs font-medium transition',
        copied
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700',
      )}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          <span aria-live="polite">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

type CopyBothButtonProps = {
  commands: string[]
}

function CopyBothButton({ commands }: CopyBothButtonProps) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(commands.join('\n'))
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => setCopied(false))
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition',
        copied
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/50',
      )}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          <span aria-live="polite">Copied both</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>Copy both</span>
        </>
      )}
    </button>
  )
}
