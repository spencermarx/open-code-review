/**
 * OpenCode CLI adapter.
 *
 * Implements the AiCliAdapter interface for the OpenCode coding agent.
 *
 * Invocation: `opencode run --format json --agent build` with the prompt on stdin
 * Output:     NDJSON with event types: text, tool_use, reasoning, step_start, step_finish, error
 *
 * Key differences from Claude Code:
 * - `--format json` for NDJSON output (different event schema from Claude)
 * - Agent-based tool control (`--agent build` for full tools, `--agent plan` for read-only)
 * - Session resume via `--session <id> --continue` (not `--resume`)
 * - Tool events arrive as complete objects (not separate start/stop deltas)
 * - Tool names are lowercase (bash, read, write) — normalized to PascalCase for formatToolDetail
 */

import { execBinary, spawnBinary } from '@open-code-review/platform'
import { buildFileStdio, closeFileStdio, deliverPrompt, assertNonEmptyPrompt } from './helpers.js'
import type {
  AiCliAdapter,
  DetectionResult,
  LineParser,
  NormalizedEvent,
  SpawnOptions,
  SpawnResult,
} from './types.js'
import { writeSync } from 'node:fs'
import { childEnv, formatChildEnvHeader } from '../../child-env.js'
import {
  buildResumeArgs as buildResumeArgsShared,
  buildResumeCommand as buildResumeCommandShared,
} from '@open-code-review/persistence/vendor-resume'

// ── Helpers ──

/** Capitalize first letter to match formatToolDetail case convention (bash → Bash). */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export class OpenCodeAdapter implements AiCliAdapter {
  readonly name = 'OpenCode'
  readonly binary = 'opencode'
  // OpenCode's `--agent build/plan` flag is the closest analog to a per-task
  // primitive but does not currently expose per-subagent model overrides.
  // Configured per-instance models will run uniformly on the parent model
  // until OpenCode adds per-task model support; OCR surfaces a warning to
  // the user when this happens.
  readonly supportsPerTaskModel = false
  // OpenCode exposes a sub-agent primitive (`--agent`), so reviewer sub-agents
  // can be spawned in-agent (uniform model — see supportsPerTaskModel above).
  readonly supportsSubagentSpawn = true

  buildResumeArgs(vendorSessionId: string): string[] {
    return buildResumeArgsShared('opencode', vendorSessionId)
  }

  buildResumeCommand(vendorSessionId: string): string {
    return buildResumeCommandShared('opencode', vendorSessionId)
  }

  detect(): DetectionResult {
    try {
      // Deliberate ambient spawn: argument-only `--version` detection probe
      // (needs only PATH; documented exception per the child-env posture
      // spec).
      // eslint-disable-next-line no-restricted-syntax
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
    // Reject an empty prompt before spawning — a workflow child is detached
    // and unref'd, so a post-spawn rejection would orphan it (blocker B1).
    assertNonEmptyPrompt(opts.prompt)

    const isWorkflow = opts.mode === 'workflow'

    // OpenCode uses agent-based tool control instead of allowlists:
    //   build = full tool access (write, edit, bash, etc.)
    //   plan  = read-only analysis (file edits and bash require approval)
    const agent = opts.allowedTools
      ? undefined // caller specified tools — skip agent flag and let OpenCode defaults apply
      : isWorkflow ? 'build' : 'plan'

    // The prompt is NOT an argv element — it is delivered on stdin below
    // (issue #43): argv embedded user input + review content in process
    // listings, was an injection surface under the old Windows shell:true
    // spawning, and hit cmd.exe's ~8191-char command-line limit on large
    // workflow prompts. `opencode run` reads the message from stdin when
    // no positional is given (verified, including with --session/--continue).
    const args: string[] = [
      'run',
      '--format', 'json',
    ]

    if (agent) {
      args.push('--agent', agent)
    }

    // Session resume: --session <id> --continue
    //
    // This argv shape is intentionally DIFFERENT from the user-facing
    // resume command (`opencode --session <id>`) emitted by
    // `@open-code-review/persistence/vendor-resume`. The two operational
    // contexts:
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

    // File-stdio (root-cause wedge fix — see claude-adapter): in workflow mode
    // with a per-execution log file, stdout+stderr go to the FILE so a leaked
    // grandchild can't hold a pipe whose EOF blocks `proc.on('close')`. stdin
    // is a pipe carrying the prompt. Shared helper, same as Claude.
    const { stdio, logFd, logPath } = buildFileStdio(
      isWorkflow ? opts.logFile : undefined,
    )

    // Shell-parity env from the frozen launch snapshot; `opts.env` is the
    // closed inject channel (e.g. OCR_DASHBOARD_EXECUTION_UID for the
    // late-linking workflow_id flow), applied by the builder AFTER the deny
    // step — mirrors the Claude adapter.
    const envResult = childEnv(opts.env)
    // Provenance header into the exec log (human-only; parsers drop
    // non-JSON lines). Names only — never values.
    if (logFd !== null) {
      writeSync(logFd, `${formatChildEnvHeader(envResult)}\n`)
    }

    // OpenCode does not support --max-turns; agents run to completion.
    const proc = spawnBinary('opencode', args, {
      cwd: opts.cwd,
      env: envResult.env,
      detached: isWorkflow,
      stdio,
    })

    // The child has its own dup of the log fd; close the parent's copy.
    closeFileStdio(logFd)

    // See claude-adapter: detached workflows are unref'd so a wedged child can
    // never hold the dashboard's event loop open; the command-runner reaps the
    // tree and finalizes via the `result` event + watchdog.
    if (isWorkflow) proc.unref()

    // Prompt over stdin via the shared helper (EPIPE-guarded) — mirrors the
    // Claude adapter byte for byte.
    deliverPrompt(proc, opts.prompt)

    return {
      process: proc,
      detached: isWorkflow,
      ...(logPath ? { logPath } : {}),
    }
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
    //
    // No `result` NormalizedEvent (round-1 SF5): unlike Claude's stream-json,
    // OpenCode emits no single terminal sentinel — `step_finish` fires per step,
    // so mapping it to `result` would set `resultSeenAt` mid-run and let the
    // watchdog's result-grace branch reap a still-working agent. We deliberately
    // do NOT synthesize one. Finalization for OpenCode is the file-stdio'd
    // `proc.on('close')` (reliable now that no leaked grandchild can hold the
    // output pipe) plus the hard-deadline backstop. The watchdog's result-grace
    // optimization is therefore Claude-only by design, not by oversight.

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
