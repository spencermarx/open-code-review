/**
 * Claude Code CLI adapter.
 *
 * Implements the AiCliAdapter interface for Claude Code's headless mode.
 * Extracted from the previously duplicated spawn logic in command-runner.ts,
 * chat-handler.ts, and post-handler.ts.
 *
 * Invocation: `claude --print --output-format stream-json [flags]` with prompt on stdin
 * Output: NDJSON with stream_event / content_block_delta / assistant message types.
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
import { extractAssistantText } from './helpers.js'
import { cleanEnv } from '../../socket/env.js'
import {
  buildResumeArgs as buildResumeArgsShared,
  buildResumeCommand as buildResumeCommandShared,
} from '@open-code-review/cli/vendor-resume'

// ── Default Tool Sets ──

const WORKFLOW_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TodoWrite', 'TodoRead', 'Task']
const QUERY_TOOLS = ['Read', 'Grep', 'Glob']

// ── Bundled known-good model list ──
//
// Best-effort fallback when Claude Code does not expose its own enumeration
// command. May go stale; the user can always type any model id Claude Code
// itself accepts (free-text input is the canonical bypass).
const BUNDLED_CLAUDE_MODELS: ModelDescriptor[] = [
  { id: 'claude-opus-4-7', displayName: 'Claude Opus 4.7' },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
]

export class ClaudeCodeAdapter implements AiCliAdapter {
  readonly name = 'Claude Code'
  readonly binary = 'claude'
  // Claude Code subagent definitions support per-subagent model frontmatter,
  // so per-task model overrides are honored at the host level.
  readonly supportsPerTaskModel = true

  buildResumeArgs(vendorSessionId: string): string[] {
    return buildResumeArgsShared('claude', vendorSessionId)
  }

  buildResumeCommand(vendorSessionId: string): string {
    return buildResumeCommandShared('claude', vendorSessionId)
  }

  detect(): DetectionResult {
    try {
      const output = execBinary('claude', ['--version'], {
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
    // Workflow turn budget needs to cover the whole 8-phase orchestration
    // plus per-reviewer fan-out. A 6-reviewer round measured at roughly
    // 45–50 turns just to reach `synthesis` (every `ocr state transition`,
    // `session start-instance`, Task spawn, `bind-vendor-id`,
    // `end-instance` is one turn). The previous cap of 50 hit mid-`reviews`
    // and Claude Code stopped cleanly with exit 0 — surface fine, but the
    // workflow was incomplete and the user had to invoke `ocr review`
    // again to finish (verified across May 5 runs in the Wrkbelt
    // worktree's orchestration_events table).
    //
    // 500 gives ~10x headroom for large reviewer fleets, code-heavy diffs,
    // and multi-round flows. Still bounded so a runaway loop terminates,
    // but high enough that real workflows complete in one shot.
    const maxTurns = opts.maxTurns ?? (isWorkflow ? 500 : 1)
    const tools = opts.allowedTools ?? (isWorkflow ? WORKFLOW_TOOLS : QUERY_TOOLS)

    // Build Claude CLI flags
    const flags: string[] = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--max-turns', String(maxTurns),
      '--allowedTools', ...tools,
    ]

    // Chat resume support
    if (opts.resumeSessionId) {
      flags.push('--resume', opts.resumeSessionId)
    }

    // Per-instance model override (vendor-native string, no OCR translation)
    if (opts.model) {
      flags.push('--model', opts.model)
    }

    // Spawn claude directly with stdin pipe (no shell needed). Merge any
    // caller-supplied env vars (e.g. OCR_DASHBOARD_EXECUTION_UID for the
    // late-linking workflow_id flow) on top of the cleaned baseline so
    // child `ocr` invocations inherit the dashboard's execution context.
    const proc = spawnBinary('claude', flags, {
      cwd: opts.cwd,
      env: { ...cleanEnv(), ...(opts.env ?? {}) },
      detached: isWorkflow,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Write prompt to stdin
    proc.stdin?.write(opts.prompt)
    proc.stdin?.end()

    return { process: proc, detached: isWorkflow }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    // Claude Code does not currently expose a `--list-models --json` command.
    // Probe defensively in case a future version adds it; otherwise fall back
    // to the bundled known-good list. Free-text input remains the final
    // escape hatch — this method only seeds the dashboard's dropdown.
    try {
      const output = execBinary('claude', ['models', '--json'], {
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
    return BUNDLED_CLAUDE_MODELS
  }

  createParser(): LineParser {
    return new ClaudeLineParser()
  }

  parseLine(line: string): NormalizedEvent[] {
    return new ClaudeLineParser().parseLine(line)
  }
}

/**
 * Stateful Claude Code stream-json parser.
 *
 * Carries per-spawn state so streaming `input_json_delta` events can be
 * accumulated and emitted as a single `tool_call` with the complete input
 * once the corresponding `content_block_stop` arrives.
 *
 * Also tracks block index → vendor tool_use id so `tool_result` events
 * (which Claude reports under their vendor id, not the synthesized
 * `block-${index}` correlator) can be remapped onto the same toolId the
 * renderer uses to pair calls with results.
 */
class ClaudeLineParser implements LineParser {
  /** Block index → assembled input JSON string. */
  private readonly inputBuffers = new Map<number, string>()
  /** Block index → tool name (set on content_block_start). */
  private readonly toolNames = new Map<number, string>()
  /** Block index → block type (so we know which content_block_stop matters). */
  private readonly blockTypes = new Map<number, 'text' | 'thinking' | 'tool_use'>()
  /** Vendor tool_use id (toolu_*) → our synthesized `block-${index}` correlator. */
  private readonly vendorToolIdToBlockId = new Map<string, string>()

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

    // Capture session ID from any message type
    if (parsed['session_id']) {
      events.push({ type: 'session_id', id: parsed['session_id'] as string })
    }

    if (type === 'stream_event') {
      const event = parsed['event'] as Record<string, unknown> | undefined
      if (!event) return events
      const eventType = event['type'] as string | undefined
      const blockIndex = (event['index'] as number) ?? -1
      const toolId = `block-${blockIndex}`

      if (eventType === 'content_block_start') {
        const block = event['content_block'] as Record<string, unknown> | undefined
        const blockType = block?.['type'] as string | undefined
        if (blockType === 'text') {
          this.blockTypes.set(blockIndex, 'text')
        } else if (blockType === 'thinking') {
          this.blockTypes.set(blockIndex, 'thinking')
        } else if (blockType === 'tool_use') {
          this.blockTypes.set(blockIndex, 'tool_use')
          const toolName = (block?.['name'] as string) ?? ''
          this.toolNames.set(blockIndex, toolName)
          this.inputBuffers.set(
            blockIndex,
            JSON.stringify(block?.['input'] ?? {}),
          )
          // Remember the vendor tool_use id (toolu_*) so we can remap
          // tool_result references onto our `block-${index}` correlator.
          const vendorId = block?.['id']
          if (typeof vendorId === 'string' && vendorId.length > 0) {
            this.vendorToolIdToBlockId.set(vendorId, toolId)
          }
        }
      }

      if (eventType === 'content_block_delta') {
        const delta = event['delta'] as Record<string, unknown> | undefined
        const deltaType = delta?.['type'] as string | undefined

        if (deltaType === 'text_delta' && typeof delta?.['text'] === 'string') {
          events.push({ type: 'text_delta', text: delta['text'] as string })
        }

        // Promote thinking deltas — previously dropped after parsing.
        if (deltaType === 'thinking_delta' && typeof delta?.['thinking'] === 'string') {
          events.push({ type: 'thinking_delta', text: delta['thinking'] as string })
        }

        // First-class tool input delta — accumulate into per-block buffer
        // and surface the delta on the wire so streaming consumers can
        // show the args being typed in real time. The full input is
        // emitted via `tool_call` at content_block_stop.
        if (deltaType === 'input_json_delta' && typeof delta?.['partial_json'] === 'string') {
          const partial = delta['partial_json'] as string
          const existing = this.inputBuffers.get(blockIndex) ?? ''
          // The initial buffer was JSON-stringified `{}` — replace it once
          // real partial JSON starts flowing. Otherwise append.
          if (existing === '{}') {
            this.inputBuffers.set(blockIndex, partial)
          } else {
            this.inputBuffers.set(blockIndex, existing + partial)
          }
          events.push({
            type: 'tool_input_delta',
            toolId,
            deltaJson: partial,
          })
        }
      }

      // Block finished — emit the assembled tool_call when this was a
      // tool_use block. For text/thinking, no event is needed (deltas
      // already carried the content).
      if (eventType === 'content_block_stop') {
        const blockType = this.blockTypes.get(blockIndex)
        if (blockType === 'tool_use') {
          const name = this.toolNames.get(blockIndex) ?? 'unknown'
          const inputJson = this.inputBuffers.get(blockIndex) ?? '{}'
          let input: Record<string, unknown> = {}
          try {
            const parsedInput = JSON.parse(inputJson)
            if (parsedInput && typeof parsedInput === 'object' && !Array.isArray(parsedInput)) {
              input = parsedInput as Record<string, unknown>
            }
          } catch {
            // Malformed partial JSON — emit with empty input rather than dropping.
          }
          events.push({ type: 'tool_call', toolId, name, input })
        }
        this.blockTypes.delete(blockIndex)
        this.toolNames.delete(blockIndex)
        this.inputBuffers.delete(blockIndex)
      }
    }

    // Top-level `assistant` events are full-message snapshots that
    // duplicate content already delivered via `content_block_delta`
    // text_delta events. Emitting them as a `message` event made the
    // renderer paint the same paragraph twice — once from the
    // streamed deltas, once from the snapshot — visible as the
    // fragmented-then-coalesced double in screenshots. obsidian-ai's
    // adapter takes the same stance (`claude-code.ts` "Skip them" on
    // `assistant`/`text` types) and we follow suit.
    if (type === 'assistant') {
      // Intentionally skip. Streamed deltas are the canonical source.
    }

    // User-role messages from the agent's perspective — these carry tool_result
    // blocks back to the orchestrator after a tool runs. We remap the vendor
    // tool_use_id (toolu_*) onto our `block-${index}` correlator so the
    // renderer can pair calls with results by toolId.
    if (type === 'user') {
      const msg = parsed['message'] as Record<string, unknown> | undefined
      const content = msg?.['content']
      if (Array.isArray(content)) {
        for (const block of content as Array<Record<string, unknown>>) {
          if (block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
            const vendorId = block['tool_use_id'] as string
            const toolId = this.vendorToolIdToBlockId.get(vendorId) ?? vendorId
            events.push({
              type: 'tool_result',
              toolId,
              output: extractToolResultOutput(block['content']),
              isError: block['is_error'] === true,
            })
            this.vendorToolIdToBlockId.delete(vendorId)
          }
        }
      }
    }

    // Top-level error / system events — surface as structured errors.
    if (type === 'system' && parsed['subtype'] === 'error') {
      const message =
        typeof parsed['message'] === 'string' ? (parsed['message'] as string) : 'Agent error'
      events.push({ type: 'error', source: 'agent', message })
    }

    return events
  }
}

/**
 * Tool results in Claude's stream come either as a string or as a content
 * blocks array (for richer results). Coerce to a single string for our
 * renderer; richer rendering (e.g. images) is deferred to a later pass.
 */
function extractToolResultOutput(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    let out = ''
    for (const block of content as Array<Record<string, unknown>>) {
      if (block['type'] === 'text' && typeof block['text'] === 'string') {
        out += block['text']
      }
    }
    return out
  }
  return ''
}
