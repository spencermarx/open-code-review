/**
 * Per-`UnresumableReason` user-facing microcopy.
 *
 * Edits to user-visible failure messages happen here; React components
 * stay untouched. Each entry has the same three-part shape (headline,
 * cause, remediation) so the panel can render them uniformly.
 *
 * The CI lint test (`__tests__/microcopy-completeness.test.ts`) iterates
 * `ALL_UNRESUMABLE_REASONS` (the runtime const below) — adding a variant
 * without a microcopy entry fails CI. The earlier hand-maintained
 * `ALL_REASONS = [...]` literal in the test was a maintenance trap:
 * adding a variant in one file and forgetting the test passed green.
 * Round-1 Blocker 2 fix.
 */

/**
 * Runtime-iterable list of every reason the handoff route can return
 * for `unresumable` outcomes. Type and runtime data are derived from
 * this single source: `UnresumableReason = typeof ALL_UNRESUMABLE_REASONS[number]`.
 *
 * Adding a new reason requires:
 *  1. Append to this array (compile-time enforcement of `Record<UnresumableReason,…>`).
 *  2. Add a microcopy entry below (compile-time enforced again — the
 *     `Record` type catches the missing key).
 *  3. The lint test then proves the runtime entry is non-empty.
 */
export const ALL_UNRESUMABLE_REASONS = [
  'workflow-not-found',
  'no-session-id-captured',
  'host-binary-missing',
] as const

export type UnresumableReason = typeof ALL_UNRESUMABLE_REASONS[number]

export type UnresumableMicrocopy = {
  /** Single-sentence user-altitude headline. */
  headline: string
  /** One sentence explaining the most likely cause. */
  cause: string
  /** One sentence telling the user what to do next. */
  remediation: string
}

export const UNRESUMABLE_MICROCOPY: Record<UnresumableReason, UnresumableMicrocopy> = {
  'workflow-not-found': {
    headline: "We couldn't find this workflow.",
    cause:
      'The workflow id in the URL or session list does not match a known session in this workspace.',
    remediation:
      'Confirm the URL or pick the session again from the Sessions list.',
  },
  'no-session-id-captured': {
    headline: "This session can't be resumed.",
    cause:
      'The AI never emitted a session id we could capture — typically because the run crashed before the first message, or the vendor adapter is out of date.',
    remediation:
      "Start a fresh review from your AI CLI's slash command (e.g. /ocr:review). If this keeps happening, your installed AI CLI may be older than the OCR adapter expects.",
  },
  'host-binary-missing': {
    headline: "Your AI CLI isn't on the PATH this dashboard sees.",
    cause:
      "The dashboard didn't detect the vendor's binary at startup — pasting the resume command into your terminal would fail.",
    remediation:
      "Install the vendor CLI (e.g. `npm i -g @anthropic-ai/claude-code` for Claude Code) so it's on your PATH, then restart the dashboard.",
  },
}

export function microcopyFor(reason: UnresumableReason): UnresumableMicrocopy {
  return UNRESUMABLE_MICROCOPY[reason]
}
