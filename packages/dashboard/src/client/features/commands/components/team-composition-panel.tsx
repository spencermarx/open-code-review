import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  Save,
  UserPlus,
  X,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useAiCli } from '../../../hooks/use-ai-cli'
import { ReviewerIcon } from './reviewer-icon'
import {
  useAvailableModels,
  useResolvedTeam,
  useSetDefaultTeam,
} from '../hooks/use-team'
import { useReviewers } from '../hooks/use-reviewers'
import type { ReviewerInstance } from '../../../lib/api-types'

const DEFAULT_LABEL = '(default)'

type TeamCompositionPanelProps = {
  /** The current resolved override (or null to use disk). Caller controls. */
  override: ReviewerInstance[] | null
  /** Called whenever the user edits — pass null to clear and use disk config. */
  onOverrideChange: (override: ReviewerInstance[] | null) => void
  /** Whether the user has opted to save edits as the new disk default. */
  saveAsDefault: boolean
  onSaveAsDefaultChange: (next: boolean) => void
  className?: string
}

/**
 * Team Composition Panel (Spec 1) — the flagship UI for the new-review flow.
 *
 * Shows the resolved team composition for the active workspace, with controls
 * to: bump count per persona, switch between "Same model" and "Per reviewer"
 * mode, pick per-instance models from a dropdown populated by the active
 * AI CLI's `listModels()`, add/remove personas, and (opt-in) persist edits
 * back to `.ocr/config.yaml`.
 *
 * The panel is uncontrolled at the override level — callers own the
 * override state so it can be passed verbatim to `command:run` as `--team`.
 */
export function TeamCompositionPanel({
  override,
  onOverrideChange,
  saveAsDefault,
  onSaveAsDefaultChange,
  className,
}: TeamCompositionPanelProps) {
  const { activeCli } = useAiCli()
  const { data: resolvedFromDisk, isLoading: teamLoading } = useResolvedTeam()
  const { data: modelList, isLoading: modelsLoading } = useAvailableModels(activeCli ?? undefined)
  const { reviewers, isLoaded: reviewersLoaded } = useReviewers()
  const setDefault = useSetDefaultTeam()

  // Working set: override if user has edited, else mirror disk config.
  const team = override ?? resolvedFromDisk?.team ?? []

  const grouped = useMemo(() => groupByPersona(team), [team])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)

  const updateTeam = (mutator: (prev: ReviewerInstance[]) => ReviewerInstance[]): void => {
    const base = override ?? resolvedFromDisk?.team ?? []
    onOverrideChange(mutator(base))
  }

  const clearOverride = (): void => onOverrideChange(null)

  const personasInTeam = new Set(grouped.map((g) => g.persona))
  const addable = reviewers.filter((r) => !personasInTeam.has(r.id))

  const isLoading = teamLoading || !reviewersLoaded
  const hasEdits = override !== null

  // Effective model list — `(default)` is the synthetic "omit --model flag" entry
  const modelOptions: ModelOption[] = useMemo(() => {
    const base: ModelOption[] = [{ id: '', label: DEFAULT_LABEL, isDefault: true }]
    if (modelList?.models) {
      for (const m of modelList.models) {
        base.push({ id: m.id, label: m.displayName ? `${m.id} — ${m.displayName}` : m.id })
      }
    }
    return base
  }, [modelList])

  const modelListEmpty = !modelsLoading && (modelList?.models?.length ?? 0) === 0

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Team composition
        </h3>
        {hasEdits && (
          <button
            type="button"
            onClick={clearOverride}
            className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Reset to default
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading team…</p>
      ) : grouped.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No team configured. Add a reviewer to get started.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {grouped.map((group) => (
            <PersonaRow
              key={group.persona}
              group={group}
              expanded={!!expanded[group.persona]}
              onToggleExpand={() =>
                setExpanded((prev) => ({ ...prev, [group.persona]: !prev[group.persona] }))
              }
              modelOptions={modelOptions}
              modelListEmpty={modelListEmpty}
              icon={reviewers.find((r) => r.id === group.persona)?.icon}
              displayName={reviewers.find((r) => r.id === group.persona)?.name ?? group.persona}
              onCountChange={(next) =>
                updateTeam((prev) => setPersonaCount(prev, group.persona, next))
              }
              onUniformModelChange={(model) =>
                updateTeam((prev) => setUniformModel(prev, group.persona, model))
              }
              onInstanceModelChange={(idx, model) =>
                updateTeam((prev) =>
                  prev.map((inst) =>
                    inst.persona === group.persona && inst.instance_index === idx
                      ? { ...inst, model }
                      : inst,
                  ),
                )
              }
              onRemove={() =>
                updateTeam((prev) => prev.filter((inst) => inst.persona !== group.persona))
              }
            />
          ))}
        </ul>
      )}

      {/* Add reviewer */}
      <div>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={addable.length === 0}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium',
              addable.length === 0
                ? 'cursor-not-allowed text-zinc-400 dark:text-zinc-600'
                : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100',
            )}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add reviewer
          </button>
        ) : (
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value
              if (id) {
                updateTeam((prev) => [
                  ...prev,
                  {
                    persona: id,
                    instance_index: 1,
                    name: `${id}-1`,
                    model: null,
                  },
                ])
              }
              setAdding(false)
            }}
            onBlur={() => setAdding(false)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Choose a reviewer…</option>
            {addable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Save as default */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(e) => onSaveAsDefaultChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-700"
          />
          <span>Save as default for this workspace</span>
        </label>
        {hasEdits && saveAsDefault && (
          <button
            type="button"
            onClick={() => setDefault.mutate(team)}
            disabled={setDefault.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition',
              'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
              'dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/50',
              setDefault.isPending && 'opacity-50',
            )}
          >
            <Save className="h-3 w-3" />
            {setDefault.isPending ? 'Saving…' : 'Save now'}
          </button>
        )}
      </div>

      {hasEdits && (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          {summarizeOverride(grouped, resolvedFromDisk?.team ?? [])}
        </p>
      )}
    </div>
  )
}

// ── Persona row ──

type PersonaGroup = {
  persona: string
  instances: ReviewerInstance[]
}

type ModelOption = {
  id: string
  label: string
  isDefault?: boolean
}

type PersonaRowProps = {
  group: PersonaGroup
  expanded: boolean
  onToggleExpand: () => void
  modelOptions: ModelOption[]
  modelListEmpty: boolean
  icon?: string
  displayName: string
  onCountChange: (next: number) => void
  onUniformModelChange: (model: string | null) => void
  onInstanceModelChange: (instanceIndex: number, model: string | null) => void
  onRemove: () => void
}

function PersonaRow({
  group,
  expanded,
  onToggleExpand,
  modelOptions,
  modelListEmpty,
  icon,
  displayName,
  onCountChange,
  onUniformModelChange,
  onInstanceModelChange,
  onRemove,
}: PersonaRowProps) {
  const count = group.instances.length
  const uniqueModels = new Set(group.instances.map((i) => i.model))
  const isUniform = uniqueModels.size <= 1
  const [mode, setMode] = useState<'uniform' | 'per-instance'>(
    isUniform ? 'uniform' : 'per-instance',
  )

  // Auto-flip to per-instance when external state introduces variance
  useEffect(() => {
    if (!isUniform && mode === 'uniform') setMode('per-instance')
  }, [isUniform, mode])

  const sharedModel = group.instances[0]?.model ?? null

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        {count > 1 ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Collapse instances' : 'Expand instances'}
            className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-5" aria-hidden />
        )}

        {icon && (
          <ReviewerIcon
            icon={icon}
            className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
          />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {displayName}
        </span>

        {/* Count stepper */}
        <div className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => onCountChange(Math.max(0, count - 1))}
            aria-label="Decrease count"
            className="px-1.5 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[1.5rem] px-1 text-center text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
            {count}
          </span>
          <button
            type="button"
            onClick={() => onCountChange(count + 1)}
            aria-label="Increase count"
            className="px-1.5 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Mode toggle (count > 1 only) */}
        {count > 1 && (
          <div className="hidden items-center gap-0.5 rounded-md border border-zinc-200 p-0.5 sm:inline-flex dark:border-zinc-800">
            <ModeChip
              active={mode === 'uniform' && isUniform}
              onClick={() => {
                setMode('uniform')
                if (!isUniform) onUniformModelChange(sharedModel)
              }}
              label="Same model"
            />
            <ModeChip
              active={mode === 'per-instance' || !isUniform}
              onClick={() => setMode('per-instance')}
              label="Per reviewer"
            />
          </div>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove reviewer"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Model row(s) */}
      {count > 0 && (
        <div className="mt-2 ml-7 space-y-1">
          {(mode === 'uniform' && isUniform) || count === 1 ? (
            <ModelPicker
              value={sharedModel ?? ''}
              options={modelOptions}
              freeText={modelListEmpty}
              onChange={(value) => onUniformModelChange(value || null)}
              compact
            />
          ) : (
            (expanded ? group.instances : []).map((inst) => (
              <div
                key={`${inst.persona}-${inst.instance_index}`}
                className="flex items-center gap-2"
              >
                <span className="w-32 shrink-0 truncate text-xs text-zinc-500 dark:text-zinc-500">
                  {inst.name}
                </span>
                <ModelPicker
                  value={inst.model ?? ''}
                  options={modelOptions}
                  freeText={modelListEmpty}
                  onChange={(value) =>
                    onInstanceModelChange(inst.instance_index, value || null)
                  }
                  compact
                />
              </div>
            ))
          )}
          {!isUniform && !expanded && count > 1 && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="text-[11px] text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Show {count} per-reviewer model overrides
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function ModeChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded px-2 py-0.5 text-[11px] font-medium transition',
        active
          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200',
      )}
    >
      {label}
    </button>
  )
}

// ── Model picker (dropdown OR free text fallback) ──

type ModelPickerProps = {
  value: string
  options: ModelOption[]
  onChange: (next: string) => void
  freeText: boolean
  compact?: boolean
}

function ModelPicker({ value, options, onChange, freeText, compact }: ModelPickerProps) {
  if (freeText) {
    return (
      <input
        type="text"
        value={value}
        placeholder="Type model id…"
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
          compact ? 'max-w-md' : '',
        )}
      />
    )
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
        compact ? 'max-w-md' : '',
      )}
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

// ── Pure helpers ──

function groupByPersona(team: ReviewerInstance[]): PersonaGroup[] {
  const map = new Map<string, ReviewerInstance[]>()
  for (const inst of team) {
    const list = map.get(inst.persona) ?? []
    list.push(inst)
    map.set(inst.persona, list)
  }
  // Sort instances within each persona by instance_index for stable display
  for (const [persona, list] of map) {
    list.sort((a, b) => a.instance_index - b.instance_index)
    map.set(persona, list)
  }
  return Array.from(map, ([persona, instances]) => ({ persona, instances }))
}

function setPersonaCount(
  team: ReviewerInstance[],
  persona: string,
  next: number,
): ReviewerInstance[] {
  const others = team.filter((inst) => inst.persona !== persona)
  if (next <= 0) return others
  const existing = team.filter((inst) => inst.persona === persona)
  // Inherit existing model on growth; truncate on shrink
  const result: ReviewerInstance[] = []
  for (let i = 1; i <= next; i++) {
    const prior = existing[i - 1]
    result.push({
      persona,
      instance_index: i,
      name: prior?.name ?? `${persona}-${i}`,
      model: prior?.model ?? existing[0]?.model ?? null,
    })
  }
  return [...others, ...result].sort((a, b) =>
    a.persona === b.persona ? a.instance_index - b.instance_index : 0,
  )
}

function setUniformModel(
  team: ReviewerInstance[],
  persona: string,
  model: string | null,
): ReviewerInstance[] {
  return team.map((inst) => (inst.persona === persona ? { ...inst, model } : inst))
}

function summarizeOverride(
  current: PersonaGroup[],
  base: ReviewerInstance[],
): string {
  const baseGroups = groupByPersona(base)
  const baseMap = new Map(baseGroups.map((g) => [g.persona, g.instances]))
  let differing = 0
  for (const g of current) {
    const baseList = baseMap.get(g.persona) ?? []
    const sameLength = baseList.length === g.instances.length
    const sameModels =
      sameLength &&
      g.instances.every((inst, i) => inst.model === baseList[i]?.model)
    if (!sameLength || !sameModels) differing++
  }
  for (const g of baseGroups) {
    if (!current.find((c) => c.persona === g.persona)) differing++
  }
  if (differing === 0) return 'No effective changes vs. workspace default.'
  return `${differing} ${differing === 1 ? 'persona' : 'personas'} customized for this run.`
}
