import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, ShieldAlert, Sparkles } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useReviewers } from '../hooks/use-reviewers'
import { ReviewerDefaults, type ReviewerSelection } from './reviewer-defaults'
import { ReviewerDialog } from './reviewer-dialog'

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
  team?: ReviewerSelection[]
}

/**
 * Extract all `--reviewer` values from a raw command string.
 * Supports optional redundancy prefix: `--reviewer 2:"description"` or `--reviewer "description"`.
 * Handles both single-quoted and double-quoted values.
 * Returns the string with --reviewer flags removed, plus the extracted entries.
 */
function extractReviewerFlags(raw: string): { cleaned: string; entries: { description: string; count: number }[] } {
  const entries: { description: string; count: number }[] = []
  // Match --reviewer optionally followed by N: then a quoted string
  const cleaned = raw.replace(/--reviewer\s+(?:(\d+):)?(?:"([^"]*?)"|'([^']*?)')/g, (_match, countStr, dq, sq) => {
    entries.push({
      description: dq ?? sq ?? '',
      count: parseInt(countStr ?? '1', 10) || 1,
    })
    return ''
  })
  return { cleaned: cleaned.replace(/\s{2,}/g, ' ').trim(), entries }
}

export function parseCommandString(raw: string): ParsedCommand | null {
  // Extract --reviewer flags first (they contain spaces that break split)
  const { cleaned, entries: reviewerEntries } = extractReviewerFlags(raw)

  const normalized = cleaned.replace(/^ocr\s+/, '')
  const parts = normalized.split(/\s+/)
  const commandId = parts[0] ?? ''

  if (!COMMANDS.find((c) => c.id === commandId)) return null

  const params: Record<string, string | boolean> = {}
  let team: ReviewerSelection[] | undefined
  let i = 1
  while (i < parts.length) {
    const token = parts[i] ?? ''
    if (token === '--fresh') {
      params['fresh'] = true
      i++
    } else if (token === '--team' && i + 1 < parts.length) {
      const teamStr = parts[i + 1] ?? ''
      team = parseTeamArg(teamStr)
      i += 2
    } else if (token === '--requirements' && i + 1 < parts.length) {
      // Consume remaining tokens as requirements (must be last)
      const remaining = parts.slice(i + 1)
      // Stop at --team if it appears after --requirements
      const teamIdx = remaining.indexOf('--team')
      if (teamIdx >= 0) {
        params['requirements'] = remaining.slice(0, teamIdx).join(' ')
        const teamStr = remaining[teamIdx + 1] ?? ''
        team = parseTeamArg(teamStr)
      } else {
        params['requirements'] = remaining.join(' ')
      }
      break
    } else if (!token.startsWith('--')) {
      params['target'] = token
      i++
    } else {
      i++
    }
  }

  // Append ephemeral selections from --reviewer flags
  if (reviewerEntries.length > 0) {
    if (!team) team = []
    reviewerEntries.forEach((entry, idx) => {
      team!.push({ id: `ephemeral-${idx + 1}`, count: entry.count, description: entry.description })
    })
  }

  return { commandId, params, team }
}

// ── Helpers ──

/**
 * Parse the value of a `--team` arg back into a `ReviewerSelection[]` for
 * re-run prefill. Accepts both shorthand (`principal:2,quality:1`) and the
 * JSON `ReviewerInstance[]` shape produced by `serializeTeam` when models
 * are customized.
 */
function parseTeamArg(raw: string): ReviewerSelection[] {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Array<{
        persona?: unknown
        instance_index?: unknown
        model?: unknown
      }>
      const grouped = new Map<string, { count: number; models: (string | null)[] }>()
      for (const entry of parsed) {
        if (typeof entry.persona !== 'string') continue
        const idx =
          typeof entry.instance_index === 'number' ? entry.instance_index : 1
        const model =
          typeof entry.model === 'string' ? entry.model : null
        const existing = grouped.get(entry.persona) ?? { count: 0, models: [] }
        existing.count = Math.max(existing.count, idx)
        existing.models[idx - 1] = model
        grouped.set(entry.persona, existing)
      }
      return Array.from(grouped, ([id, { count, models }]) => {
        const arr: (string | null)[] = []
        for (let i = 0; i < count; i++) arr.push(models[i] ?? null)
        return arr.some((m) => m !== null)
          ? { id, count, models: arr }
          : { id, count }
      })
    } catch {
      // Fall through to shorthand parser below
    }
  }
  return trimmed
    .split(',')
    .map((entry) => {
      const [id = '', countStr] = entry.split(':')
      return { id, count: parseInt(countStr ?? '1', 10) || 1 }
    })
    .filter((s) => s.id.length > 0)
}

/**
 * Serialize the user's library-reviewer selection for the `--team` flag.
 *
 * Two output forms:
 *   - **Shorthand** `principal:2,quality:1` — emitted when no selection
 *     carries per-instance model overrides. Backwards-compatible with
 *     command-runner's pre-existing `--team` parser.
 *   - **JSON ReviewerInstance[]** — emitted when at least one selection has
 *     a `models` array. The AI workflow consumes this via
 *     `ocr team resolve --session-override <json>`.
 */
function serializeTeam(selection: ReviewerSelection[]): string {
  const library = selection.filter((s) => !s.description)
  const hasModels = library.some(
    (s) => s.models && s.models.length === s.count && s.models.some((m) => m !== null),
  )
  if (!hasModels) {
    return library.map((s) => `${s.id}:${s.count}`).join(',')
  }
  // Expand into ReviewerInstance[] JSON
  const instances: Array<{
    persona: string
    instance_index: number
    name: string
    model: string | null
  }> = []
  for (const s of library) {
    for (let i = 0; i < s.count; i++) {
      instances.push({
        persona: s.id,
        instance_index: i + 1,
        name: `${s.id}-${i + 1}`,
        model: s.models?.[i] ?? null,
      })
    }
  }
  return JSON.stringify(instances)
}

function selectionsEqual(a: ReviewerSelection[], b: ReviewerSelection[]): boolean {
  // Ephemeral entries always make selections "different" from defaults
  if (a.some((s) => s.description) || b.some((s) => s.description)) return false
  // Per-instance model overrides also count as differences from the default
  if (
    a.some((s) => s.models?.some((m) => m !== null)) ||
    b.some((s) => s.models?.some((m) => m !== null))
  ) {
    return false
  }
  if (a.length !== b.length) return false
  const mapA = new Map(a.map((s) => [s.id, s.count]))
  for (const s of b) {
    if (mapA.get(s.id) !== s.count) return false
  }
  return true
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

  // Reviewer state
  const { reviewers, defaults, isLoaded } = useReviewers()
  const [teamOverride, setTeamOverride] = useState<ReviewerSelection[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const selectedCommand = COMMANDS.find((c) => c.id === selectedId) ?? COMMANDS[0]!
  const isReview = selectedCommand.id === 'review'

  // Compute default selection from meta.json defaults
  const defaultSelection: ReviewerSelection[] = isLoaded
    ? defaults.map((id) => {
        // Try to infer count from config default_team pattern (principal:2 etc.)
        // For now, default to 1 per reviewer in the defaults list.
        // If the same ID appears multiple times in defaults, count them.
        return { id, count: 1 }
      })
      // Deduplicate and sum counts for same IDs
      .reduce<ReviewerSelection[]>((acc, s) => {
        const existing = acc.find((a) => a.id === s.id)
        if (existing) {
          existing.count += s.count
        } else {
          acc.push({ ...s })
        }
        return acc
      }, [])
    : []

  // Active selection: override or defaults
  const activeSelection = teamOverride ?? defaultSelection

  // Handle prefill from history re-run — synchronous "adjust state during render" pattern
  const [prevPrefill, setPrevPrefill] = useState<ParsedCommand | null>(null)
  if (prefill !== prevPrefill) {
    setPrevPrefill(prefill)
    if (prefill) {
      setSelectedId(prefill.commandId)
      setParamValues(prefill.params)
      setTeamOverride(prefill.team ?? null)
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
    setTeamOverride(null)
    setConfirming(false)
  }

  function setParam(name: string, value: string | boolean) {
    setParamValues((prev) => ({ ...prev, [name]: value }))
  }

  function handleRemoveReviewer(id: string) {
    const current = teamOverride ?? defaultSelection
    const next = current.filter((s) => s.id !== id)
    setTeamOverride(next)
  }

  const handleApplyReviewers = useCallback((selection: ReviewerSelection[]) => {
    // If selection matches defaults exactly, clear override
    if (selectionsEqual(selection, defaultSelection)) {
      setTeamOverride(null)
    } else {
      setTeamOverride(selection)
    }
    setDialogOpen(false)
  }, [defaultSelection])

  function buildCommandString(): string {
    const parts = [selectedCommand.command]

    const target = paramValues['target']
    if (typeof target === 'string' && target.trim()) {
      parts.push(target.trim())
    }

    if (paramValues['fresh'] === true) {
      parts.push('--fresh')
    }

    // Add --team if reviewer selection differs from defaults (library reviewers only)
    if (isReview && teamOverride !== null) {
      const teamStr = serializeTeam(teamOverride)
      if (teamStr) {
        parts.push('--team', teamStr)
      }

      // Add --reviewer flags for ephemeral reviewers (with optional count prefix)
      for (const s of teamOverride) {
        if (s.description) {
          const escaped = s.description.replace(/"/g, '\\"')
          if (s.count > 1) {
            parts.push('--reviewer', `${s.count}:"${escaped}"`)
          } else {
            parts.push('--reviewer', `"${escaped}"`)
          }
        }
      }
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
    setTeamOverride(null)
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

          {/* Reviewer selection (review command only) */}
          {isReview && (
            <ReviewerDefaults
              reviewers={reviewers}
              selection={activeSelection}
              isLoaded={isLoaded}
              disabled={isRunning}
              onRemove={handleRemoveReviewer}
              onCustomize={() => setDialogOpen(true)}
            />
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

      {/* Reviewer selection dialog */}
      {isReview && (
        <ReviewerDialog
          open={dialogOpen}
          reviewers={reviewers}
          initialSelection={activeSelection}
          onApply={handleApplyReviewers}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
