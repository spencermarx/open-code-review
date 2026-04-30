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
  ModelDescriptor,
  NormalizedEvent,
  SpawnOptions,
  SpawnResult,
} from './types.js'
import { cleanEnv } from '../../socket/env.js'

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
    if (opts.resumeSessionId) {
      args.push('--session', opts.resumeSessionId, '--continue')
    }

    // Per-instance model override (vendor-native string, no OCR translation)
    if (opts.model) {
      args.push('--model', opts.model)
    }

    // OpenCode does not support --max-turns; agents run to completion.
    // stdin is not needed — the prompt is passed as a positional argument.
    const proc = spawnBinary('opencode', args, {
      cwd: opts.cwd,
      env: cleanEnv(),
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
    // Emitted once per complete text block (not streaming deltas).
    if (type === 'text') {
      const part = parsed['part'] as Record<string, unknown> | undefined
      const text = part?.['text'] as string | undefined
      if (text) {
        events.push({ type: 'text', text })
        events.push({ type: 'full_text', text })
      }
    }

    // ── Tool Use ──
    // { type: "tool_use", part: { tool: "bash", callID: "...", state: { status: "completed"|"error" }, input: {...}, ... } }
    // OpenCode only emits tool_use when the tool is completed or errored,
    // so we emit tool_start + tool_end together.
    if (type === 'tool_use') {
      const part = parsed['part'] as Record<string, unknown> | undefined
      if (part) {
        const rawTool = (part['tool'] as string) ?? 'unknown'
        const input = extractToolInput(part)

        events.push({
          type: 'tool_start',
          name: capitalize(rawTool),
          input,
        })
        events.push({ type: 'tool_end', blockIndex: 0 })
      }
    }

    // ── Reasoning / Thinking ──
    // { type: "reasoning", part: { type: "reasoning", text: "..." } }
    if (type === 'reasoning') {
      events.push({ type: 'thinking' })
    }

    // step_start, step_finish, and error events are informational —
    // no NormalizedEvent mapping needed (consumers handle via process exit).

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
