import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Terminal, X, AlertCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useHandoff } from '../hooks/use-agent-sessions'

type Mode = 'ocr' | 'vendor'

type TerminalHandoffPanelProps = {
  workflowId: string | null
  onClose: () => void
}

const VENDOR_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
}

export function TerminalHandoffPanel({ workflowId, onClose }: TerminalHandoffPanelProps) {
  const { data, isLoading, error } = useHandoff(workflowId ?? undefined)
  const [mode, setMode] = useState<Mode>('ocr')
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

  const vendorLabel = data?.vendor ? (VENDOR_LABELS[data.vendor] ?? data.vendor) : '—'
  const isFreshStart = data?.fallback === 'fresh-start'
  const vendorAvailable = data?.host_binary_available ?? false
  const effectiveMode: Mode = isFreshStart || !data?.vendor_command ? 'ocr' : mode

  const stepOne = data ? `cd ${data.project_dir}` : ''
  const stepTwo =
    data == null
      ? ''
      : effectiveMode === 'vendor' && data.vendor_command
        ? data.vendor_command
        : data.ocr_command

  const stepTwoLabel = isFreshStart
    ? 'Start a fresh review'
    : effectiveMode === 'vendor'
      ? `Resume directly in ${vendorLabel}`
      : 'Resume the OCR review'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="handoff-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-700">
          <Terminal className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" />
          <div className="min-w-0 flex-1">
            <h2
              id="handoff-title"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Pick up this review in your terminal
            </h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {data ? (
                <>
                  AI CLI: <span className="font-medium">{vendorLabel}</span>
                  <span className="mx-1">·</span>
                  Project: <span className="font-mono">{data.project_dir}</span>
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

          {data && (
            <div className="space-y-4">
              {/* Mode toggle (hidden when no vendor command available) */}
              {data.vendor_command && !isFreshStart && (
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                  <ModeButton
                    active={mode === 'ocr'}
                    onClick={() => setMode('ocr')}
                    primary="Continue the OCR review"
                    detail="re-enters the workflow"
                  />
                  <ModeButton
                    active={mode === 'vendor'}
                    onClick={() => setMode('vendor')}
                    primary={`Resume in ${vendorLabel}`}
                    detail="bypasses OCR"
                  />
                </div>
              )}

              {effectiveMode === 'vendor' && (
                <p className="rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
                  This bypasses OCR. Your review state will not advance — the
                  conversation continues in {vendorLabel} only.
                </p>
              )}

              {isFreshStart && (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                  No vendor session was captured for this workflow — likely the
                  AI crashed before its first message. Start fresh from your
                  terminal instead.
                </p>
              )}

              {/* Step-by-step commands */}
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

              {/* Hints */}
              <div className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <p>
                  Requires the OCR CLI installed
                  {data.vendor && (
                    <>
                      {' '}and{' '}
                      <span className="font-medium">{vendorLabel}</span>
                      {' '}on your <span className="font-mono">$PATH</span>
                      {!vendorAvailable && !isFreshStart && (
                        <>
                          {' '}— we couldn't see it from the dashboard. Install it
                          or use <span className="font-medium">Continue here</span>{' '}
                          to resume in the dashboard instead.
                        </>
                      )}
                    </>
                  )}
                  .
                </p>
              </div>

              {stepOne && stepTwo && (
                <div className="flex justify-end">
                  <CopyBothButton commands={[stepOne, stepTwo]} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type ModeButtonProps = {
  active: boolean
  onClick: () => void
  primary: string
  detail: string
}

function ModeButton({ active, onClick, primary, detail }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition',
        active
          ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/50',
      )}
    >
      <span className="text-xs font-medium">{primary}</span>
      <span className="text-[11px] text-zinc-500 dark:text-zinc-500">{detail}</span>
    </button>
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
