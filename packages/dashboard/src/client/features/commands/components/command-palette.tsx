import { useEffect, useRef, useState } from 'react'
import { Play, ShieldAlert, Sparkles } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ── Command registry ──

type CommandParam = {
  name: string
  type: 'text' | 'toggle'
  label: string
  placeholder?: string
}

type CommandDef = {
  id: string
  command: string
  label: string
  description: string
  params: CommandParam[]
}

const COMMANDS: CommandDef[] = [
  {
    id: 'review',
    command: 'ocr review',
    label: 'Review',
    description: 'Run multi-agent AI code review',
    params: [
      { name: 'target', type: 'text', label: 'Target', placeholder: 'staged (default)' },
      { name: 'requirements', type: 'text', label: 'Requirements', placeholder: 'spec.md or describe what to focus on...' },
      { name: 'fresh', type: 'toggle', label: 'Fresh start' },
    ],
  },
  {
    id: 'map',
    command: 'ocr map',
    label: 'Map',
    description: 'Generate a Code Review Map for large changesets',
    params: [
      { name: 'target', type: 'text', label: 'Target', placeholder: 'staged (default)' },
      { name: 'requirements', type: 'text', label: 'Requirements', placeholder: 'spec.md or describe what to focus on...' },
      { name: 'fresh', type: 'toggle', label: 'Fresh start' },
    ],
  },
]

// ── Parse a command string back into id + params (for re-run prefill) ──

export type ParsedCommand = {
  commandId: string
  params: Record<string, string | boolean>
}

export function parseCommandString(raw: string): ParsedCommand | null {
  const normalized = raw.replace(/^ocr\s+/, '')
  const parts = normalized.split(/\s+/)
  const commandId = parts[0] ?? ''

  if (!COMMANDS.find((c) => c.id === commandId)) return null

  const params: Record<string, string | boolean> = {}
  let i = 1
  while (i < parts.length) {
    const token = parts[i] ?? ''
    if (token === '--fresh') {
      params['fresh'] = true
      i++
    } else if (token === '--requirements' && i + 1 < parts.length) {
      // Consume all remaining tokens as the requirements value
      params['requirements'] = parts.slice(i + 1).join(' ')
      break
    } else if (!token.startsWith('--')) {
      params['target'] = token
      i++
    } else {
      i++
    }
  }

  return { commandId, params }
}

// ── Component ──

type CommandPaletteProps = {
  isRunning: boolean
  runningCount?: number
  onRunCommand: (command: string) => void
  prefill: ParsedCommand | null
  onPrefillConsumed: () => void
}

export function CommandPalette({ isRunning, runningCount, onRunCommand, prefill, onPrefillConsumed }: CommandPaletteProps) {
  const [selectedId, setSelectedId] = useState(COMMANDS[0]?.id ?? '')
  const [paramValues, setParamValues] = useState<Record<string, string | boolean>>({})
  const [confirming, setConfirming] = useState(false)
  const [highlighted, setHighlighted] = useState(false)
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const selectedCommand = COMMANDS.find((c) => c.id === selectedId) ?? COMMANDS[0]!

  // Handle prefill from history re-run — synchronous "adjust state during render" pattern
  const [prevPrefill, setPrevPrefill] = useState<ParsedCommand | null>(null)
  if (prefill !== prevPrefill) {
    setPrevPrefill(prefill)
    if (prefill) {
      setSelectedId(prefill.commandId)
      setParamValues(prefill.params)
      setConfirming(false)
      setHighlighted(true)
      onPrefillConsumed()
    }
  }

  // Clear highlight after a brief pulse
  useEffect(() => {
    if (!highlighted) return
    highlightTimer.current = setTimeout(() => setHighlighted(false), 1200)
    return () => clearTimeout(highlightTimer.current)
  }, [highlighted])

  function handleSelectCommand(id: string) {
    if (id === selectedId) return
    setSelectedId(id)
    setParamValues({})
    setConfirming(false)
  }

  function setParam(name: string, value: string | boolean) {
    setParamValues((prev) => ({ ...prev, [name]: value }))
  }

  function buildCommandString(): string {
    const parts = [selectedCommand.command]

    const target = paramValues['target']
    if (typeof target === 'string' && target.trim()) {
      parts.push(target.trim())
    }

    if (paramValues['fresh'] === true) {
      parts.push('--fresh')
    }

    const requirements = paramValues['requirements']
    if (typeof requirements === 'string' && requirements.trim()) {
      parts.push('--requirements', requirements.trim())
    }

    return parts.join(' ')
  }

  function handleRun() {
    if (isRunning) return
    setConfirming(true)
  }

  function handleConfirm() {
    const cmd = buildCommandString()
    setConfirming(false)
    setParamValues({})
    onRunCommand(cmd)
  }

  return (
    <div className={cn(
      'relative overflow-hidden rounded-lg border border-zinc-200 border-l-[3px] border-l-indigo-500 transition-shadow duration-500 dark:border-zinc-800 dark:border-l-indigo-400',
      highlighted && 'ring-2 ring-indigo-400/60 shadow-md shadow-indigo-500/10',
    )}>
      {/* Pill selector */}
      <div className="flex items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <Sparkles className="mr-1.5 h-4 w-4 text-indigo-500 dark:text-indigo-400" />
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            type="button"
            onClick={() => handleSelectCommand(cmd.id)}
            className={cn(
              'rounded-full px-3.5 py-1 text-xs font-medium transition-colors',
              cmd.id === selectedId
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800',
            )}
          >
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Commands run an AI agent with full read/write and shell access to your project. Only run in trusted environments.</span>
      </div>

      {/* Form body */}
      <div className="space-y-4 bg-white px-5 py-4 dark:bg-zinc-900/50">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{selectedCommand.description}</p>

        {/* Dynamic fields */}
        <div className="space-y-3">
          {selectedCommand.params.map((param) =>
            param.type === 'text' ? (
              <div key={param.name} className="flex items-center gap-3">
                <label className="w-28 shrink-0 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {param.label}
                </label>
                <input
                  type="text"
                  placeholder={param.placeholder}
                  disabled={isRunning}
                  value={(paramValues[param.name] as string) ?? ''}
                  onChange={(e) => setParam(param.name, e.target.value)}
                  className={cn(
                    'w-full rounded-md border px-3 py-1.5 text-sm',
                    'border-zinc-200 bg-zinc-50 placeholder:text-zinc-400',
                    'dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500',
                    'focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                />
              </div>
            ) : (
              <div key={param.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0" />
                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={isRunning}
                    checked={paramValues[param.name] === true}
                    onChange={(e) => setParam(param.name, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-500 focus:ring-indigo-400 dark:border-zinc-600"
                  />
                  {param.label}
                </label>
              </div>
            ),
          )}
        </div>

        {/* Run button */}
        <div className="flex items-center gap-3">
          <span className="w-28 shrink-0" />
          <button
            type="button"
            disabled={isRunning}
            onClick={handleRun}
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              'bg-indigo-600 text-white hover:bg-indigo-700',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Play className="h-3.5 w-3.5" />
            Run {selectedCommand.label}
            {runningCount != null && runningCount > 0 && (
              <span className="ml-1.5 rounded-full bg-indigo-500/20 px-1.5 text-[10px] font-normal text-indigo-300">
                {runningCount} running
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Confirmation overlay */}
      {confirming && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/95 backdrop-blur-sm dark:bg-zinc-900/95">
          <div className="flex flex-col items-center gap-3 px-4">
            <p className="text-sm font-medium">Run {selectedCommand.label}?</p>
            <p className="max-w-[260px] text-center text-xs text-zinc-500 dark:text-zinc-400">
              This will spawn a Claude Code session that may take several minutes.
            </p>
            <code className="max-w-[320px] truncate rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {buildCommandString()}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-zinc-300 px-4 py-1.5 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1 rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
              >
                <Play className="h-3 w-3" />
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
