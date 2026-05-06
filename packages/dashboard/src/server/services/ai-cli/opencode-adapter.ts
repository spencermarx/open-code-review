/**
 * OpenCode CLI adapter.
 *
 * Implements the AiCliAdapter interface for the OpenCode coding agent.
 *
 * Invocation: `opencode run "prompt" --format json --agent build`
 * Output:     NDJSON with event types: text, tool_use, reasoning, step_start, step_finish, error
 *
 * Key differences from Claude Code:
 * - Prompt passed as CLI argument (no stdin pipe needed)
 * - `--format json` for NDJSON output (different event schema from Claude)
 * - Agent-based tool control (`--agent build` for full tools, `--agent plan` for read-only)
 * - Session resume via `--session <id> --continue` (not `--resume`)
 * - Tool events arrive as complete objects (not separate start/stop deltas)
 * - Tool names are lowercase (bash, read, write) — normalized to PascalCase for formatToolDetail
 */

import { execBinary, spawnBinary } from '@open-code-review/platform'
import type {
  AiCliAdapter,
  DetectionResult,
  LineParser,
  ModelDescriptor,
  NormalizedEvent,
  SpawnOptions,
  SpawnResult,
} from './types.js'
import { cleanEnv } from '../../socket/env.js'
import {
  buildResumeArgs as buildResumeArgsShared,
  buildResumeCommand as buildResumeCommandShared,
} from '@open-code-review/cli/vendor-resume'

// ── Helpers ──

/** Capitalize first letter to match formatToolDetail case convention (bash → Bash). */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Bundled known-good model list ──
//
// OpenCode is provider-agnostic. The bundled fallback covers a few common
// provider/model identifiers; native enumeration via `opencode models --json`
// is the preferred path when available.
const BUNDLED_OPENCODE_MODELS: ModelDescriptor[] = [
  { id: 'anthropic/claude-opus-4-7', provider: 'anthropic' },
  { id: 'anthropic/claude-sonnet-4-6', provider: 'anthropic' },
  { id: 'anthropic/claude-haiku-4-5-20251001', provider: 'anthropic' },
]

export class OpenCodeAdapter implements AiCliAdapter {
  readonly name = 'OpenCode'
  readonly binary = 'opencode'
  // OpenCode's `--agent build/plan` flag is the closest analog to a per-task
  // primitive but does not currently expose per-subagent model overrides.
  // Configured per-instance models will run uniformly on the parent model
  // until OpenCode adds per-task model support; OCR surfaces a warning to
  // the user when this happens.
  readonly supportsPerTaskModel = false

  buildResumeArgs(vendorSessionId: string): string[] {
    return buildResumeArgsShared('opencode', vendorSessionId)
  }

  buildResumeCommand(vendorSessionId: string): string {
    return buildResumeCommandShared('opencode', vendorSessionId)
  }

  detect(): DetectionResult {
    try {
      const output = execBinary('opencode', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const match = output.match(/\d+\.\d+[\.\d]*/)
      return { found: true, version: match?.[0] }
    } catch {
      return { found: false }
    }
  }

  spawn(opts: SpawnOptions): SpawnResult {
    const isWorkflow = opts.mode === 'workflow'

    // OpenCode uses agent-based tool control instead of allowlists:
    //   build = full tool access (write, edit, bash, etc.)
    //   plan  = read-only analysis (file edits and bash require approval)
    const agent = opts.allowedTools
      ? undefined // caller specified tools — skip agent flag and let OpenCode defaults apply
      : isWorkflow ? 'build' : 'plan'

    const args: string[] = [
      'run',
      opts.prompt,
      '--format', 'json',
    ]

    if (agent) {
      args.push('--agent', agent)
    }

    // Session resume: --session <id> --continue
    //
    // This argv shape is intentionally DIFFERENT from the user-facing
    // resume command (`opencode --session <id>`) emitted by
    // `cli/src/lib/vendor-resume.ts`. The two operational contexts:
    //
    //   - Spawn (here): programmatic, prompt is non-empty (we're
    //     piping a workflow turn). `run "<prompt>" --session <id>
    //     --continue` resumes the session AND processes the new
    //     prompt as the next turn.
    //   - Display (vendor-resume.ts): interactive, no prompt. The
    //     user pastes the command into their terminal to enter the
    //     session — `opencode --session <id>` opens the conversation.
    //
    // Both correct for their respective contexts; the divergence is
    // documented here and pinned by tests in opencode-adapter.test.ts
    // (spawn shape) and vendor-resume's adapter unit tests (display
    // shape). Round-3 Suggestion 8.
    if (opts.resumeSessionId) {
      args.push('--session', opts.resumeSessionId, '--continue')
    }

    // Per-instance model override (vendor-native string, no OCR translation)
    if (opts.model) {
      args.push('--model', opts.model)
    }

    // OpenCode does not support --max-turns; agents run to completion.
    // stdin is not needed — the prompt is passed as a positional argument.
    // Merge caller-supplied env vars (e.g. OCR_DASHBOARD_EXECUTION_UID for
    // the late-linking workflow_id flow) on top of the cleaned baseline so
    // child `ocr` invocations inherit the dashboard's execution context.
    const proc = spawnBinary('opencode', args, {
      cwd: opts.cwd,
      env: { ...cleanEnv(), ...(opts.env ?? {}) },
      detached: isWorkflow,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    return { process: proc, detached: isWorkflow }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    // OpenCode has historically exposed model discovery via configuration
    // rather than a CLI subcommand. Probe defensively for `models --json`
    // in case a future version adds it; otherwise fall back to the bundled
    // list. Free-text input is the canonical bypass for users on unusual
    // provider/model combinations.
    try {
      const output = execBinary('opencode', ['models', '--json'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const parsed: unknown = JSON.parse(output)
      if (Array.isArray(parsed)) {
        const models: ModelDescriptor[] = []
        for (const item of parsed) {
          if (typeof item === 'string') {
            models.push({ id: item })
          } else if (
            typeof item === 'object' &&
            item !== null &&
            'id' in (item as Record<string, unknown>) &&
            typeof (item as Record<string, unknown>).id === 'string'
          ) {
            const obj = item as Record<string, unknown>
            const desc: ModelDescriptor = { id: obj.id as string }
            if (typeof obj.displayName === 'string') desc.displayName = obj.displayName
            if (typeof obj.provider === 'string') desc.provider = obj.provider
            if (Array.isArray(obj.tags)) {
              desc.tags = obj.tags.filter((t): t is string => typeof t === 'string')
            }
            models.push(desc)
          }
        }
        if (models.length > 0) {
          return models
        }
      }
    } catch {
      // Native enumeration unavailable — fall through to bundled list
    }
    return BUNDLED_OPENCODE_MODELS
  }

  /**
   * OpenCode emits each event with all its content already resolved (tool
   * results arrive in the same event as the call), so the parser is
   * stateless. We expose `createParser` for interface symmetry — every
   * call returns a fresh parser even though there's no state to track.
   */
  createParser(): LineParser {
    return { parseLine: (line: string) => this.parseLine(line) }
  }

  parseLine(line: string): NormalizedEvent[] {
    if (!line.trim()) return []

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(line) as Record<string, unknown>
    } catch {
      return []
    }

    const events: NormalizedEvent[] = []
    const type = parsed['type'] as string | undefined

    // Every NDJSON event carries sessionID at the top level
    if (parsed['sessionID']) {
      events.push({ type: 'session_id', id: parsed['sessionID'] as string })
    }

    // ── Text ──
    // { type: "text", part: { type: "text", text: "...", time: { end: ... } } }
    // OpenCode emits one event per complete text block (not streaming deltas),
    // so we emit a single `message` rather than `text_delta` + `message`.
    if (type === 'text') {
      const part = parsed['part'] as Record<string, unknown> | undefined
      const text = part?.['text'] as string | undefined
      if (text) {
        events.push({ type: 'message', text })
      }
    }

    // ── Tool Use ──
    // { type: "tool_use", part: { tool: "bash", callID: "...", state: {
    //     status: "completed"|"error", input: {...}, output: "..." } } }
    // OpenCode only emits tool_use when the tool finishes, so the call AND
    // its result arrive together. We emit both tool_call and tool_result
    // in order so the renderer can pair them.
    if (type === 'tool_use') {
      const part = parsed['part'] as Record<string, unknown> | undefined
      if (part) {
        const rawTool = (part['tool'] as string) ?? 'unknown'
        const callId = (part['callID'] as string) ?? ''
        const toolId = callId || `opencode-tool-${events.length}`
        const input = extractToolInput(part)
        const state = part['state'] as Record<string, unknown> | undefined
        const status = state?.['status'] as string | undefined
        const output = extractToolOutput(part)
        const isError = status === 'error'

        events.push({
          type: 'tool_call',
          toolId,
          name: capitalize(rawTool),
          input,
        })
        events.push({
          type: 'tool_result',
          toolId,
          output,
          isError,
        })
      }
    }

    // ── Reasoning / Thinking ──
    // { type: "reasoning", part: { type: "reasoning", text: "..." } }
    // OpenCode emits the full reasoning text in one event — there's no
    // delta stream to follow, so we surface it as a single thinking_delta.
    if (type === 'reasoning') {
      const part = parsed['part'] as Record<string, unknown> | undefined
      const text = part?.['text'] as string | undefined
      if (text) {
        events.push({ type: 'thinking_delta', text })
      }
    }

    // ── Error ──
    // { type: "error", error: { message: "...", ... } }
    // Top-level error events distinct from process stderr.
    if (type === 'error') {
      const errorObj = parsed['error'] as Record<string, unknown> | undefined
      const message =
        (errorObj?.['message'] as string | undefined) ??
        (parsed['message'] as string | undefined) ??
        'Agent error'
      const detail =
        typeof errorObj?.['detail'] === 'string' ? (errorObj['detail'] as string) : undefined
      events.push({ type: 'error', source: 'agent', message, ...(detail ? { detail } : {}) })
    }

    // step_start / step_finish are intra-process phase markers — they're
    // not sub-agent boundaries (OCR sub-agents come from `ocr session`
    // calls, journaled separately). Intentionally ignored.

    return events
  }
}

// ── Tool Input Extraction ──

/**
 * Extract tool input from an OpenCode tool part.
 *
 * OpenCode nests input differently depending on tool state:
 * - Completed: input is at `part.state.input` or directly at `part.input`
 * - The state object also contains `output` for completed tools
 */
function extractToolInput(part: Record<string, unknown>): Record<string, unknown> {
  // Try direct input field first
  const directInput = part['input'] as Record<string, unknown> | undefined
  if (directInput && typeof directInput === 'object') return directInput

  // Fall back to state.input (some tool states nest it there)
  const state = part['state'] as Record<string, unknown> | undefined
  const stateInput = state?.['input'] as Record<string, unknown> | undefined
  if (stateInput && typeof stateInput === 'object') return stateInput

  return {}
}

/**
 * Extract tool output (text shown to the user) from an OpenCode tool part.
 * Output lives in `part.state.output` — which can be a string or a richer
 * structure depending on the tool. Coerce to a single string for now.
 */
function extractToolOutput(part: Record<string, unknown>): string {
  const state = part['state'] as Record<string, unknown> | undefined
  const output = state?.['output']
  if (typeof output === 'string') return output
  if (output && typeof output === 'object') {
    // Some tool outputs nest a `text` field
    const text = (output as Record<string, unknown>)['text']
    if (typeof text === 'string') return text
    try {
      return JSON.stringify(output)
    } catch {
      return ''
    }
  }
  return ''
}
