import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Settings2,
  X,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Minus,
  Plus,
  PenLine,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import {
  TIER_CONFIG,
  filterReviewers,
  groupByTier,
} from "../../../lib/reviewer-utils";
import { ReviewerIcon } from "./reviewer-icon";
import { useAvailableModels } from "../hooks/use-team";
import { useAiCli } from "../../../hooks/use-ai-cli";
import { ModelSelect, type ModelSelectOption } from "../../../components/ui/model-select";
import type { ReviewerMeta, ReviewerTier } from "../hooks/use-reviewers";
import type { ReviewerSelection } from "./reviewer-defaults";

const DEFAULT_LABEL = "(default model)";
const DEFAULT_DETAIL = "Use the host CLI's default";

// ── Props ──

type ReviewerDialogProps = {
  open: boolean;
  reviewers: ReviewerMeta[];
  initialSelection: ReviewerSelection[];
  onApply: (selection: ReviewerSelection[]) => void;
  onClose: () => void;
};

/** Internal state for an ephemeral reviewer entry. */
type EphemeralEntry = {
  description: string;
  count: number;
};

export function ReviewerDialog({
  open,
  reviewers,
  initialSelection,
  onApply,
  onClose,
}: ReviewerDialogProps) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Map<string, number>>(new Map());
  const [collapsedTiers, setCollapsedTiers] = useState<Set<ReviewerTier>>(
    new Set(),
  );
  const [expandedHelp, setExpandedHelp] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ephemeral reviewer state
  const [ephemeralEntries, setEphemeralEntries] = useState<EphemeralEntry[]>([]);
  const [showEphemeralForm, setShowEphemeralForm] = useState(false);
  const [ephemeralDraft, setEphemeralDraft] = useState("");
  const ephemeralTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Per-reviewer Advanced state — models[i] is the override for instance i.
  // Absent key = no overrides; present with all-null = explicit "no override".
  const [models, setModels] = useState<Map<string, (string | null)[]>>(
    new Map(),
  );
  const [advancedOpen, setAdvancedOpen] = useState<Set<string>>(new Set());

  const { activeCli } = useAiCli();
  const { data: modelList, isLoading: modelsLoading } = useAvailableModels(
    activeCli ?? undefined,
  );
  const modelOptions: ModelSelectOption[] = useMemo(() => {
    const opts: ModelSelectOption[] = [
      { id: "", label: DEFAULT_LABEL, detail: DEFAULT_DETAIL },
    ];
    if (modelList?.models) {
      for (const m of modelList.models) {
        opts.push({
          id: m.id,
          // Friendly name primary; raw model id as the mono detail line.
          label: m.displayName ?? m.id,
          detail: m.displayName ? m.id : undefined,
        });
      }
    }
    return opts;
  }, [modelList]);
  const modelListEmpty = !modelsLoading && (modelList?.models?.length ?? 0) === 0;

  // Sync selection from props when dialog opens
  useEffect(() => {
    if (open) {
      const map = new Map<string, number>();
      const modelMap = new Map<string, (string | null)[]>();
      const entries: EphemeralEntry[] = [];
      for (const s of initialSelection) {
        if (s.description) {
          entries.push({ description: s.description, count: s.count });
        } else {
          map.set(s.id, s.count);
          if (s.models && s.models.length === s.count) {
            modelMap.set(s.id, s.models);
          }
        }
      }
      setSelection(map);
      setModels(modelMap);
      setAdvancedOpen(new Set());
      setEphemeralEntries(entries);
      setSearch("");
      setExpandedHelp(null);
      setShowEphemeralForm(false);
      setEphemeralDraft("");
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, initialSelection]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Filter reviewers by search
  const filtered = useMemo(
    () => filterReviewers(reviewers, search),
    [reviewers, search],
  );

  // Group by tier
  const grouped = useMemo(() => groupByTier(filtered), [filtered]);

  function toggleReviewer(id: string) {
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, 1);
      }
      return next;
    });
    // Drop any model overrides + close Advanced when deselecting
    setModels((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setAdvancedOpen((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function setCount(id: string, count: number) {
    const clamped = Math.max(1, Math.min(3, count));
    setSelection((prev) => {
      const next = new Map(prev);
      next.set(id, clamped);
      return next;
    });
    // Resize the models array to match — preserve existing entries, fill new with null.
    setModels((prev) => {
      const existing = prev.get(id);
      if (!existing) return prev;
      const next = new Map(prev);
      const resized: (string | null)[] = [];
      for (let i = 0; i < clamped; i++) resized.push(existing[i] ?? null);
      next.set(id, resized);
      return next;
    });
  }

  function toggleAdvanced(id: string) {
    setAdvancedOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Initialize models array on first open so the dropdowns have something to render
    setModels((prev) => {
      if (prev.has(id)) return prev;
      const count = selection.get(id) ?? 1;
      const next = new Map(prev);
      next.set(id, Array(count).fill(null));
      return next;
    });
  }

  function setUniformModel(id: string, model: string | null) {
    setModels((prev) => {
      const next = new Map(prev);
      const count = selection.get(id) ?? 1;
      next.set(id, Array(count).fill(model));
      return next;
    });
  }

  function setInstanceModel(
    id: string,
    instanceIndex: number,
    model: string | null,
  ) {
    setModels((prev) => {
      const existing = prev.get(id);
      const count = selection.get(id) ?? 1;
      const arr = existing
        ? [...existing]
        : (Array(count).fill(null) as (string | null)[]);
      arr[instanceIndex] = model;
      const next = new Map(prev);
      next.set(id, arr);
      return next;
    });
  }

  function toggleTier(tier: ReviewerTier) {
    setCollapsedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) {
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  }

  function addEphemeral() {
    const trimmed = ephemeralDraft.trim();
    if (!trimmed) return;
    setEphemeralEntries((prev) => [...prev, { description: trimmed, count: 1 }]);
    setEphemeralDraft("");
    setShowEphemeralForm(false);
  }

  function removeEphemeral(index: number) {
    setEphemeralEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function setEphemeralCount(index: number, count: number) {
    const clamped = Math.max(1, Math.min(3, count));
    setEphemeralEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, count: clamped } : e)),
    );
  }

  function handleApply() {
    const result: ReviewerSelection[] = [];
    for (const [id, count] of selection) {
      const modelOverrides = models.get(id);
      // Only emit `models` when the user actually customized it — i.e. the
      // array exists AND at least one entry is non-null. An all-null array
      // would be functionally equivalent to omitting the field; we drop it.
      const customized =
        modelOverrides &&
        modelOverrides.length === count &&
        modelOverrides.some((m) => m !== null);
      result.push(customized ? { id, count, models: modelOverrides } : { id, count });
    }
    // Append ephemeral selections
    ephemeralEntries.forEach((entry, idx) => {
      result.push({
        id: `ephemeral-${idx + 1}`,
        count: entry.count,
        description: entry.description,
      });
    });
    onApply(result);
  }

  if (!open) return null;

  const selectedCount =
    selection.size + ephemeralEntries.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Select Reviewers
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-zinc-200 px-5 py-2.5 dark:border-zinc-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reviewers..."
              className={cn(
                "w-full rounded-md border py-1.5 pl-8 pr-3 text-sm",
                "border-zinc-200 bg-zinc-50 placeholder:text-zinc-400",
                "dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500",
                "focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50",
              )}
            />
          </div>
        </div>

        {/* Reviewer list */}
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-3">
          {grouped.length === 0 && ephemeralEntries.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
              No reviewers match your search.
            </p>
          )}

          {grouped.map(([tier, items]) => {
            const isCollapsed = collapsedTiers.has(tier);
            const config = TIER_CONFIG[tier];

            return (
              <div key={tier} className="mb-4 last:mb-0">
                {/* Tier header */}
                <button
                  type="button"
                  onClick={() => toggleTier(tier)}
                  className="mb-2 flex w-full items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {config.label}
                  <span className="font-normal text-zinc-300 dark:text-zinc-600">
                    ({items.length})
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="flex flex-col gap-1.5">
                    {items.map((r) => {
                      const isSelected = selection.has(r.id);
                      const count = selection.get(r.id) ?? 1;
                      const helpOpen = expandedHelp === r.id;

                      return (
                        <div key={r.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleReviewer(r.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleReviewer(r.id);
                              }
                            }}
                            className={cn(
                              "flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 transition-colors cursor-pointer",
                              isSelected
                                ? "border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/30"
                                : "border-zinc-100 bg-white hover:border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700",
                            )}
                          >
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleReviewer(r.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-indigo-500 focus:ring-indigo-400 dark:border-zinc-600"
                            />

                            {/* Icon */}
                            <ReviewerIcon
                              icon={r.icon}
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isSelected
                                  ? "text-indigo-500 dark:text-indigo-400"
                                  : "text-zinc-400 dark:text-zinc-500",
                              )}
                            />

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                  {r.name}
                                </span>
                                {r.tier === "persona" && (
                                  <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                                    Persona
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {r.description}
                              </p>
                            </div>

                            {/* Redundancy stepper (only when selected) */}
                            {isSelected && (
                              <div
                                className="flex shrink-0 items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => setCount(r.id, count - 1)}
                                  disabled={count <= 1}
                                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-4 text-center text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                  {count}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setCount(r.id, count + 1)}
                                  disabled={count >= 3}
                                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            )}

                            {/* Advanced (per-instance models) toggle (only when selected) */}
                            {isSelected && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAdvanced(r.id);
                                }}
                                aria-expanded={advancedOpen.has(r.id)}
                                aria-label="Advanced model overrides"
                                title="Advanced — model overrides for this run"
                                className={cn(
                                  "shrink-0 rounded p-1 transition-colors",
                                  advancedOpen.has(r.id)
                                    ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400"
                                    : models.get(r.id)?.some((m) => m !== null)
                                      ? "text-indigo-500 dark:text-indigo-400"
                                      : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400",
                                )}
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Help button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedHelp(helpOpen ? null : r.id);
                              }}
                              className={cn(
                                "shrink-0 rounded p-1 transition-colors",
                                helpOpen
                                  ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400"
                                  : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400",
                              )}
                            >
                              <HelpCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Advanced (per-instance model overrides) */}
                          {isSelected && advancedOpen.has(r.id) && (
                            <AdvancedModelSection
                              count={count}
                              models={models.get(r.id) ?? Array(count).fill(null)}
                              modelOptions={modelOptions}
                              freeText={modelListEmpty}
                              personaName={r.id}
                              onUniformChange={(m) => setUniformModel(r.id, m)}
                              onInstanceChange={(idx, m) => setInstanceModel(r.id, idx, m)}
                            />
                          )}

                          {/* Help popover (expanded below card) */}
                          {helpOpen && (
                            <div className="ml-10 mt-1 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/50">
                              {r.description && (
                                <p className="mb-2 text-zinc-600 dark:text-zinc-300">
                                  {r.description}
                                </p>
                              )}
                              {r.known_for && (
                                <p className="mb-1.5">
                                  <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                                    Known for:{" "}
                                  </span>
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {r.known_for}
                                  </span>
                                </p>
                              )}
                              {r.philosophy && (
                                <p className="mb-2 italic text-zinc-500 dark:text-zinc-400">
                                  &ldquo;{r.philosophy}&rdquo;
                                </p>
                              )}
                              {r.focus_areas.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {r.focus_areas.map((area) => (
                                    <span
                                      key={area}
                                      className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                                    >
                                      {area}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── One-off Reviewers section (always visible at bottom of list) ── */}
          <div className="mb-2 mt-2">
            {/* Section header — only when entries exist */}
            {ephemeralEntries.length > 0 && (
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400">
                <PenLine className="h-3 w-3" />
                One-off Reviewers
                <span className="font-normal text-amber-400 dark:text-amber-600">
                  ({ephemeralEntries.length})
                </span>
              </div>
            )}

            {/* Added ephemeral entries */}
            <div className="flex flex-col gap-1.5">
              {ephemeralEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-lg border border-dashed px-3 py-2",
                    "border-amber-300 bg-amber-50/50",
                    "dark:border-amber-700 dark:bg-amber-950/20",
                  )}
                >
                  <PenLine className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                  <p className="min-w-0 flex-1 text-xs text-amber-700 dark:text-amber-300">
                    {entry.description}
                  </p>

                  {/* Redundancy stepper */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEphemeralCount(idx, entry.count - 1)}
                      disabled={entry.count <= 1}
                      className="rounded p-0.5 text-amber-400 hover:bg-amber-100 disabled:opacity-30 dark:text-amber-500 dark:hover:bg-amber-900"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center text-xs font-medium text-amber-600 dark:text-amber-300">
                      {entry.count}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEphemeralCount(idx, entry.count + 1)}
                      disabled={entry.count >= 3}
                      className="rounded p-0.5 text-amber-400 hover:bg-amber-100 disabled:opacity-30 dark:text-amber-500 dark:hover:bg-amber-900"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeEphemeral(idx)}
                    className="shrink-0 rounded p-1 text-amber-400 hover:bg-amber-100 hover:text-amber-600 dark:text-amber-500 dark:hover:bg-amber-900 dark:hover:text-amber-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Trigger / inline form — always visible */}
            {!showEphemeralForm ? (
              /* Collapsed: card-shaped trigger row */
              <button
                type="button"
                onClick={() => {
                  setShowEphemeralForm(true);
                  setTimeout(() => ephemeralTextareaRef.current?.focus(), 50);
                }}
                className={cn(
                  "mt-1.5 flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left transition-colors",
                  "border-zinc-300 text-zinc-400 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-600",
                  "dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-amber-600 dark:hover:bg-amber-950/20 dark:hover:text-amber-400",
                )}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="text-sm">
                  Describe a one-off reviewer for this review...
                </span>
              </button>
            ) : (
              /* Expanded: inline form */
              <div
                className={cn(
                  "mt-1.5 rounded-lg border border-dashed p-3",
                  "border-amber-400 bg-amber-50/30",
                  "dark:border-amber-600 dark:bg-amber-950/20",
                )}
              >
                <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  What should this reviewer focus on?
                </label>
                <textarea
                  ref={ephemeralTextareaRef}
                  value={ephemeralDraft}
                  onChange={(e) => setEphemeralDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addEphemeral();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setShowEphemeralForm(false);
                      setEphemeralDraft("");
                    }
                  }}
                  placeholder="e.g. Error handling in the auth flow, accessibility compliance, review as a junior developer"
                  rows={2}
                  className={cn(
                    "w-full resize-none rounded-md border px-3 py-2 text-sm",
                    "border-zinc-200 bg-white placeholder:text-zinc-400",
                    "dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500",
                    "focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50",
                  )}
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    For this review only &mdash; won&apos;t be saved to your
                    library.
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEphemeralForm(false);
                        setEphemeralDraft("");
                      }}
                      className="rounded-md px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addEphemeral}
                      disabled={!ephemeralDraft.trim()}
                      className="flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      Add to Team
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {selectedCount} reviewer{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 px-4 py-1.5 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Advanced model section (per-card disclosure) ──

type AdvancedModelSectionProps = {
  count: number;
  models: (string | null)[];
  modelOptions: ModelSelectOption[];
  freeText: boolean;
  personaName: string;
  onUniformChange: (model: string | null) => void;
  onInstanceChange: (instanceIndex: number, model: string | null) => void;
};

/**
 * Per-reviewer Advanced disclosure rendered below the card row when the
 * user clicks the gear icon. Surfaces a single model dropdown for count=1
 * and a "Same model | Per reviewer" toggle for count>1. Selections become
 * `--team` JSON overrides on Apply.
 */
function AdvancedModelSection({
  count,
  models,
  modelOptions,
  freeText,
  personaName,
  onUniformChange,
  onInstanceChange,
}: AdvancedModelSectionProps) {
  const uniqueModels = new Set(models);
  const isUniform = uniqueModels.size <= 1;
  const [mode, setMode] = useState<"uniform" | "per-instance">(
    isUniform ? "uniform" : "per-instance",
  );

  useEffect(() => {
    if (!isUniform && mode === "uniform") setMode("per-instance");
  }, [isUniform, mode]);

  const sharedModel = models[0] ?? null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="ml-10 mt-1 space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Model override (this run)
        </span>
        {count > 1 && (
          <div className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                setMode("uniform");
                if (!isUniform) onUniformChange(sharedModel);
              }}
              aria-pressed={mode === "uniform" && isUniform}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium transition",
                mode === "uniform" && isUniform
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              Same model
            </button>
            <button
              type="button"
              onClick={() => setMode("per-instance")}
              aria-pressed={mode === "per-instance" || !isUniform}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium transition",
                mode === "per-instance" || !isUniform
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              Per reviewer
            </button>
          </div>
        )}
      </div>

      {(mode === "uniform" && isUniform) || count === 1 ? (
        <ModelSelect
          value={sharedModel ?? ""}
          options={modelOptions}
          freeText={freeText}
          ariaLabel={`Model for ${personaName}`}
          onChange={(v) => onUniformChange(v || null)}
        />
      ) : (
        <div className="space-y-1">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-[11px] text-zinc-500">
                {personaName}-{i + 1}
              </span>
              <ModelSelect
                value={models[i] ?? ""}
                options={modelOptions}
                freeText={freeText}
                ariaLabel={`Model for ${personaName}-${i + 1}`}
                onChange={(v) => onInstanceChange(i, v || null)}
              />
            </div>
          ))}
        </div>
      )}

      {freeText && (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-500">
          Your AI CLI didn't return a model list. Type any model id it accepts.
        </p>
      )}
    </div>
  );
}

