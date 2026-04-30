import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Minus, Plus, RotateCcw, UserPlus, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useAiCli } from '../../../hooks/use-ai-cli'
import { ReviewerIcon } from '../../commands/components/reviewer-icon'
import { ModelSelect, type ModelSelectOption } from '../../../components/ui/model-select'
import {
  useAvailableModels,
  useResolvedTeam,
  useSetDefaultTeam,
} from '../../commands/hooks/use-team'
import { useReviewers } from '../../commands/hooks/use-reviewers'
import type { ReviewerInstance } from '../../../lib/api-types'
import type { ReviewerMeta } from '../../commands/hooks/use-reviewers'

const DEFAULT_LABEL = '(default model)'
const DEFAULT_DETAIL = "Use the host CLI's default"

type DefaultTeamSectionProps = {
  className?: string
}

/**
 * Default Team section on the Team page.
 *
 * Renders the workspace's default review team as a card grid. Each card
 * summarizes one persona's count and resolved model(s); clicking a card
 * opens a focused edit dialog. Edits auto-save to `.ocr/config.yaml`
 * (debounced) via the existing `POST /api/team/default` → `ocr team set
 * --stdin` pipeline.
 *
 * Per-run overrides — including ad-hoc model picks — live in the Command
 * Center's `ReviewerDialog`, not here.
 */
export function DefaultTeamSection({ className }: DefaultTeamSectionProps) {
  const { activeCli } = useAiCli()
  const { data: resolved, isLoading: teamLoading } = useResolvedTeam()
  const { data: modelList, isLoading: modelsLoading } = useAvailableModels(
    activeCli ?? undefined,
  )
  const { reviewers, isLoaded: reviewersLoaded } = useReviewers()
  const setDefault = useSetDefaultTeam()

  // Local working copy — every mutation writes here. Stays separate from
  // disk state until the user explicitly saves.
  const [draft, setDraft] = useState<ReviewerInstance[] | null>(null)
  // Personas marked for removal still render (muted, with an undo button)
  // until save commits the deletion. Tracking this separately from `draft`
  // is what lets us show the "Will remove" treatment.
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set())

  const team = draft ?? resolved?.team ?? []

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const grouped = useMemo(() => groupByPersona(team), [team])
  const personasInTeam = new Set(grouped.map((g) => g.persona))
  const addable = reviewers.filter((r) => !personasInTeam.has(r.id))
  const personasOnDisk = useMemo(
    () => new Set((resolved?.team ?? []).map((i) => i.persona)),
    [resolved],
  )
  // Per-persona disk state — used to compute the "modified" indicator on
  // cards whose draft instances differ from what's saved.
  const diskInstancesByPersona = useMemo(() => {
    const map = new Map<string, ReviewerInstance[]>()
    for (const inst of resolved?.team ?? []) {
      const list = map.get(inst.persona) ?? []
      list.push(inst)
      map.set(inst.persona, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.instance_index - b.instance_index)
    }
    return map
  }, [resolved])
  const isLoading = teamLoading || !reviewersLoaded

  // The diff vs. disk — drives the Save / Discard banner and the
  // beforeunload guard.
  const isDirty = useMemo(() => {
    if (!resolved) return false
    if (pendingRemovals.size > 0) return true
    if (draft && !teamsEqual(draft, resolved.team)) return true
    return false
  }, [draft, resolved, pendingRemovals])

  // Drop the draft once the disk catches up — only when we're not still
  // editing locally. This is the post-save sync hook.
  useEffect(() => {
    if (!draft || !resolved) return
    if (pendingRemovals.size > 0) return
    if (teamsEqual(draft, resolved.team)) setDraft(null)
  }, [draft, resolved, pendingRemovals])

  const modelOptions: ModelSelectOption[] = useMemo(() => {
    const base: ModelSelectOption[] = [
      { id: '', label: DEFAULT_LABEL, detail: DEFAULT_DETAIL },
    ]
    if (modelList?.models) {
      for (const m of modelList.models) {
        base.push({
          id: m.id,
          // Friendly name primary; raw id as the mono detail line.
          label: m.displayName ?? m.id,
          detail: m.displayName ? m.id : undefined,
        })
      }
    }
    return base
  }, [modelList])

  const modelListEmpty = !modelsLoading && (modelList?.models?.length ?? 0) === 0

  // Editing state — null when no card is being edited; otherwise the persona id.
  const [editingPersona, setEditingPersona] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const updateTeam = (mutator: (prev: ReviewerInstance[]) => ReviewerInstance[]): void => {
    const base = draft ?? resolved?.team ?? []
    setDraft(mutator(base))
  }

  const markForRemoval = (persona: string): void => {
    setPendingRemovals((prev) => {
      const next = new Set(prev)
      next.add(persona)
      return next
    })
  }

  const undoRemoval = (persona: string): void => {
    setPendingRemovals((prev) => {
      const next = new Set(prev)
      next.delete(persona)
      return next
    })
  }

  const removeFromDraft = (persona: string): void => {
    // Used for cards that were added in this draft (not yet on disk) —
    // they should disappear instantly, since "removing an unsaved
    // addition" is a pure local-state operation.
    setDraft((prev) => {
      const base = prev ?? resolved?.team ?? []
      return base.filter((inst) => inst.persona !== persona)
    })
  }

  const handleSave = (): void => {
    const base = draft ?? resolved?.team ?? []
    const next = base.filter((inst) => !pendingRemovals.has(inst.persona))
    if (savedTimer.current) clearTimeout(savedTimer.current)
    setSaveState('saving')
    setDefault.mutate(next, {
      onSuccess: () => {
        setDraft(next)
        setPendingRemovals(new Set())
        setSaveState('saved')
        savedTimer.current = setTimeout(() => setSaveState('idle'), 2000)
      },
      onError: () => setSaveState('error'),
    })
  }

  const handleDiscard = (): void => {
    setDraft(null)
    setPendingRemovals(new Set())
    setSaveState('idle')
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }

  // Cmd/Ctrl + S to save — only when there's something to save and we're
  // not already mid-save. Listens at window scope so the shortcut fires
  // regardless of focus position within the section.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (saveState !== 'saving') handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, saveState])

  // Browser-native unsaved-changes warning — mirrors the idiom every
  // forms-style editor uses.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const editingGroup = editingPersona
    ? grouped.find((g) => g.persona === editingPersona) ?? null
    : null
  const editingMeta = editingPersona
    ? reviewers.find((r) => r.id === editingPersona) ?? null
    : null

  return (
    <section
      className={cn(
        'space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Default team
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            The reviewers and models used for new reviews in this workspace. Click a card to customize.
          </p>
        </div>
        <div className="shrink-0">
          {isDirty ? (
            <DirtyControls
              saving={saveState === 'saving'}
              onSave={handleSave}
              onDiscard={handleDiscard}
            />
          ) : (
            <SaveStatus state={saveState} />
          )}
        </div>
      </header>

      {isLoading ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading team…</p>
      ) : grouped.length === 0 && addable.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No reviewers available. Run <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">/ocr:sync-reviewers</code> from your IDE to populate the library below.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {grouped.map((group) => {
            const meta = reviewers.find((r) => r.id === group.persona) ?? null
            const markedForRemoval = pendingRemovals.has(group.persona)
            const isNewlyAdded = !personasOnDisk.has(group.persona)
            const diskInstances = diskInstancesByPersona.get(group.persona)
            const isModified =
              !isNewlyAdded &&
              !markedForRemoval &&
              diskInstances != null &&
              !instancesEqual(group.instances, diskInstances)
            return (
              <DefaultTeamCard
                key={group.persona}
                group={group}
                meta={meta}
                markedForRemoval={markedForRemoval}
                isNewlyAdded={isNewlyAdded}
                isModified={isModified}
                onEdit={() => {
                  if (markedForRemoval) return
                  setEditingPersona(group.persona)
                }}
                onRemove={() => {
                  // Newly-added cards (not yet on disk) just vanish from
                  // the draft — there's nothing to "stage for removal."
                  if (isNewlyAdded) {
                    removeFromDraft(group.persona)
                  } else {
                    markForRemoval(group.persona)
                  }
                }}
                onUndoRemoval={() => undoRemoval(group.persona)}
              />
            )
          })}
          <AddReviewerCard
            disabled={addable.length === 0}
            picking={picking}
            addable={addable}
            onStart={() => setPicking(true)}
            onCancel={() => setPicking(false)}
            onSelect={(id) => {
              setPicking(false)
              updateTeam((prev) => [
                ...prev,
                {
                  persona: id,
                  instance_index: 1,
                  name: `${id}-1`,
                  model: null,
                },
              ])
              setEditingPersona(id)
            }}
          />
        </div>
      )}

      {editingGroup && (
        <EditTeamReviewerDialog
          group={editingGroup}
          meta={editingMeta}
          modelOptions={modelOptions}
          modelListEmpty={modelListEmpty}
          onClose={() => setEditingPersona(null)}
          onCountChange={(next) =>
            updateTeam((prev) => setPersonaCount(prev, editingGroup.persona, next))
          }
          onUniformModelChange={(model) =>
            updateTeam((prev) => setUniformModel(prev, editingGroup.persona, model))
          }
          onInstanceModelChange={(idx, model) =>
            updateTeam((prev) =>
              prev.map((inst) =>
                inst.persona === editingGroup.persona && inst.instance_index === idx
                  ? { ...inst, model }
                  : inst,
              ),
            )
          }
        />
      )}
    </section>
  )
}

// ── Card components ──

type PersonaGroup = {
  persona: string
  instances: ReviewerInstance[]
}

type DefaultTeamCardProps = {
  group: PersonaGroup
  meta: ReviewerMeta | null
  /** True while the reviewer is staged for removal but not yet saved. */
  markedForRemoval: boolean
  /** True if this persona is in the draft but not yet on disk. */
  isNewlyAdded: boolean
  /** True if the persona's count or models differ from the saved state. */
  isModified: boolean
  onEdit: () => void
  onRemove: () => void
  onUndoRemoval: () => void
}

function DefaultTeamCard({
  group,
  meta,
  markedForRemoval,
  isNewlyAdded,
  isModified,
  onEdit,
  onRemove,
  onUndoRemoval,
}: DefaultTeamCardProps) {
  const count = group.instances.length
  const models = group.instances.map((i) => i.model)
  const uniqueModels = Array.from(new Set(models))
  const allDefault = uniqueModels.length === 1 && uniqueModels[0] === null
  const summary = allDefault
    ? '(default model)'
    : uniqueModels.length === 1
      ? shortModel(uniqueModels[0]!)
      : `Mixed · ${uniqueModels.length} models`

  const displayName = meta?.name ?? group.persona

  return (
    <div
      role="button"
      tabIndex={markedForRemoval ? -1 : 0}
      aria-disabled={markedForRemoval}
      onClick={markedForRemoval ? undefined : onEdit}
      onKeyDown={(e) => {
        if (markedForRemoval) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border p-3 transition-colors',
        markedForRemoval
          ? 'cursor-default border-dashed border-amber-300 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/20'
          : isNewlyAdded
            ? 'cursor-pointer border-dashed border-indigo-300/70 bg-indigo-50/30 hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-indigo-700/70 dark:bg-indigo-950/20 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/30'
            : 'cursor-pointer border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50',
      )}
    >
      <div className="flex items-start gap-2">
        {meta?.icon && (
          <ReviewerIcon
            icon={meta.icon}
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0',
              markedForRemoval
                ? 'text-amber-600/70 dark:text-amber-500/70'
                : 'text-zinc-500 dark:text-zinc-400',
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3
              className={cn(
                'truncate text-sm font-medium',
                markedForRemoval
                  ? 'text-amber-700/80 line-through decoration-amber-500/70 dark:text-amber-300/80'
                  : 'text-zinc-900 dark:text-zinc-100',
              )}
            >
              {displayName}
            </h3>
            {isModified && (
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                role="status"
                aria-label="Modified — unsaved"
                title="Modified — unsaved"
              />
            )}
            {count > 1 && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                  markedForRemoval
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
                )}
              >
                ×{count}
              </span>
            )}
            {!markedForRemoval && isNewlyAdded && (
              <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                New
              </span>
            )}
          </div>
          {markedForRemoval ? (
            <p className="mt-0.5 text-[11px] font-medium text-amber-700/80 dark:text-amber-400/80">
              Will remove on save
            </p>
          ) : (
            meta?.description && (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                {meta.description}
              </p>
            )
          )}
        </div>
        {markedForRemoval ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onUndoRemoval()
            }}
            aria-label={`Undo removal of ${displayName}`}
            className="shrink-0 rounded p-1 text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950/40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label={`Remove ${displayName} from default team`}
            className={cn(
              'shrink-0 rounded p-1 opacity-0 transition-opacity',
              'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600',
              'group-hover:opacity-100 group-focus-within:opacity-100',
              'dark:hover:bg-zinc-800 dark:hover:text-zinc-300',
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!markedForRemoval && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              'truncate font-mono',
              allDefault
                ? 'text-zinc-400 dark:text-zinc-600'
                : 'text-zinc-700 dark:text-zinc-300',
            )}
            title={
              uniqueModels.length === 1 && uniqueModels[0]
                ? uniqueModels[0]
                : uniqueModels.length > 1
                  ? uniqueModels.filter(Boolean).join(' · ')
                  : undefined
            }
          >
            {summary}
          </span>
        </div>
      )}
    </div>
  )
}

type AddReviewerCardProps = {
  disabled: boolean
  picking: boolean
  addable: ReviewerMeta[]
  onStart: () => void
  onCancel: () => void
  onSelect: (id: string) => void
}

function AddReviewerCard({
  disabled,
  picking,
  addable,
  onStart,
  onCancel,
  onSelect,
}: AddReviewerCardProps) {
  if (picking) {
    const options: ModelSelectOption[] = addable.map((r) => ({
      id: r.id,
      label: r.name,
      detail: r.tier.charAt(0).toUpperCase() + r.tier.slice(1),
    }))
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/30 p-3 dark:border-indigo-700 dark:bg-indigo-950/20">
        <span className="text-[11px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          Add reviewer
        </span>
        <ModelSelect
          value=""
          options={options}
          defaultOpen
          ariaLabel="Choose a reviewer to add"
          freeTextPlaceholder="Choose a reviewer…"
          onChange={(id) => {
            if (id) onSelect(id)
          }}
          onOpenChange={(open) => {
            // When the listbox closes without a selection, exit the picking
            // state — same UX as the native <select>'s blur behavior.
            if (!open) onCancel()
          }}
        />
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-3 transition-colors',
        'min-h-[88px]',
        disabled
          ? 'cursor-not-allowed border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700'
          : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200',
      )}
    >
      <UserPlus className="h-4 w-4" />
      <span className="text-xs font-medium">Add reviewer</span>
    </button>
  )
}

// ── Save / discard controls (dirty state) ──

type DirtyControlsProps = {
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

function DirtyControls({ saving, onSave, onDiscard }: DirtyControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 sm:inline-flex">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
          aria-hidden
        />
        Unsaved changes
      </span>
      <button
        type="button"
        onClick={onDiscard}
        disabled={saving}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {saving ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving…
          </>
        ) : (
          <>Save changes</>
        )}
      </button>
    </div>
  )
}

// ── Save status indicator ──

type SaveStatusState = 'idle' | 'saving' | 'saved' | 'error'

function SaveStatus({ state }: { state: SaveStatusState }) {
  if (state === 'idle') return null
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        Saved
      </span>
    )
  }
  return (
    <span className="text-[11px] text-red-600 dark:text-red-400">Couldn't save</span>
  )
}

// ── Edit dialog ──

type EditTeamReviewerDialogProps = {
  group: PersonaGroup
  meta: ReviewerMeta | null
  modelOptions: ModelSelectOption[]
  modelListEmpty: boolean
  onClose: () => void
  onCountChange: (next: number) => void
  onUniformModelChange: (model: string | null) => void
  onInstanceModelChange: (instanceIndex: number, model: string | null) => void
}

function EditTeamReviewerDialog({
  group,
  meta,
  modelOptions,
  modelListEmpty,
  onClose,
  onCountChange,
  onUniformModelChange,
  onInstanceModelChange,
}: EditTeamReviewerDialogProps) {
  const count = group.instances.length
  const models = group.instances.map((i) => i.model)
  const uniqueModels = new Set(models)
  const isUniform = uniqueModels.size <= 1
  const [mode, setMode] = useState<'uniform' | 'per-instance'>(
    isUniform ? 'uniform' : 'per-instance',
  )

  useEffect(() => {
    if (!isUniform && mode === 'uniform') setMode('per-instance')
  }, [isUniform, mode])

  // ESC + initial focus
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sharedModel = group.instances[0]?.model ?? null
  const displayName = meta?.name ?? group.persona

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-team-reviewer-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-700">
          {meta?.icon && (
            <ReviewerIcon
              icon={meta.icon}
              className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400"
            />
          )}
          <div className="min-w-0 flex-1">
            <h2
              id="edit-team-reviewer-title"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {displayName}
            </h2>
            {meta?.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                {meta.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Count */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Reviewer count
            </label>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-500">
              How many independent reviews this persona produces per round.
            </p>
            <div className="mt-2 inline-flex items-center gap-0.5 rounded-md border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => onCountChange(Math.max(1, count - 1))}
                disabled={count <= 1}
                aria-label="Decrease count"
                className="px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[2rem] px-2 text-center text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                {count}
              </span>
              <button
                type="button"
                onClick={() => onCountChange(count + 1)}
                aria-label="Increase count"
                className="px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
                Model
              </label>
              {count > 1 && (
                <div className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700">
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
            </div>

            <div className="mt-2 space-y-2">
              {(mode === 'uniform' && isUniform) || count === 1 ? (
                <ModelSelect
                  value={sharedModel ?? ''}
                  options={modelOptions}
                  freeText={modelListEmpty}
                  ariaLabel="Model"
                  onChange={(value) => onUniformModelChange(value || null)}
                />
              ) : (
                group.instances.map((inst) => (
                  <div
                    key={`${inst.persona}-${inst.instance_index}`}
                    className="flex items-center gap-2"
                  >
                    <span className="w-28 shrink-0 truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                      {inst.name}
                    </span>
                    <ModelSelect
                      value={inst.model ?? ''}
                      options={modelOptions}
                      freeText={modelListEmpty}
                      ariaLabel={`Model for ${inst.name}`}
                      onChange={(value) =>
                        onInstanceModelChange(inst.instance_index, value || null)
                      }
                    />
                  </div>
                ))
              )}
            </div>

            {modelListEmpty && (
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
                Your AI CLI didn't return a model list. Type any model id it accepts.
              </p>
            )}
          </div>

          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
            Edits stay in draft until you click <span className="font-medium text-zinc-800 dark:text-zinc-200">Save changes</span> at the top of the section. Close to keep editing.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
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

// ── Pure helpers ──

/** Shorten a vendor-native model id for the card-summary display. */
function shortModel(id: string): string {
  // Strip provider prefix and any trailing date stamp for compactness.
  // e.g. `anthropic/claude-opus-4-7` → `claude-opus-4-7`
  //      `claude-haiku-4-5-20251001` → `claude-haiku-4-5`
  const noProvider = id.includes('/') ? id.split('/').slice(-1)[0]! : id
  return noProvider.replace(/-\d{8,}$/, '')
}

function groupByPersona(team: ReviewerInstance[]): PersonaGroup[] {
  const map = new Map<string, ReviewerInstance[]>()
  for (const inst of team) {
    const list = map.get(inst.persona) ?? []
    list.push(inst)
    map.set(inst.persona, list)
  }
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

/**
 * Whether two same-persona instance lists match in everything that the
 * editor surfaces — count, names, and models. Used to drive the
 * per-card "Modified" indicator.
 *
 * Both inputs are expected to be sorted by `instance_index` ascending.
 */
function instancesEqual(a: ReviewerInstance[], b: ReviewerInstance[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (
      x.persona !== y.persona ||
      x.instance_index !== y.instance_index ||
      x.name !== y.name ||
      x.model !== y.model
    ) {
      return false
    }
  }
  return true
}

function teamsEqual(a: ReviewerInstance[], b: ReviewerInstance[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (
      x.persona !== y.persona ||
      x.instance_index !== y.instance_index ||
      x.name !== y.name ||
      x.model !== y.model
    ) {
      return false
    }
  }
  return true
}
