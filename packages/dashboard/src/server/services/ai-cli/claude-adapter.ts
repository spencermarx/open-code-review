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
  ModelDescriptor,
  NormalizedEvent,
  SpawnOptions,
  SpawnResult,
} from './types.js'
import { extractAssistantText } from './helpers.js'
import { cleanEnv } from '../../socket/env.js'

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
    const maxTurns = opts.maxTurns ?? (isWorkflow ? 50 : 1)
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

    // Spawn claude directly with stdin pipe (no shell needed)
    const proc = spawnBinary('claude', flags, {
      cwd: opts.cwd,
      env: cleanEnv(),
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

      // Text deltas
      if (eventType === 'content_block_delta') {
        const delta = event['delta'] as Record<string, unknown> | undefined
        const deltaType = delta?.['type'] as string | undefined

        if (deltaType === 'text_delta' && typeof delta?.['text'] === 'string') {
          events.push({ type: 'text', text: delta['text'] as string })
        }

        if (deltaType === 'thinking_delta') {
          events.push({ type: 'thinking' })
        }

        // input_json_delta is handled by consumers that need tool input accumulation
        if (deltaType === 'input_json_delta' && typeof delta?.['partial_json'] === 'string') {
          // Emit as a special text event that tool accumulators can use
          events.push({
            type: 'tool_start',
            name: '__input_json_delta',
            input: { partial_json: delta['partial_json'] as string, blockIndex },
          })
        }
      }

      // Tool use start
      if (eventType === 'content_block_start') {
        const block = event['content_block'] as Record<string, unknown> | undefined
        if (block?.['type'] === 'tool_use') {
          events.push({
            type: 'tool_start',
            name: block['name'] as string,
            input: (block['input'] as Record<string, unknown>) ?? {},
          })
        }
      }

      // Tool use complete
      if (eventType === 'content_block_stop') {
        events.push({ type: 'tool_end', blockIndex })
      }
    }

    // Complete assistant message — full text for DB storage
    if (type === 'assistant') {
      const fullText = extractAssistantText(parsed)
      if (fullText.length > 0) {
        events.push({ type: 'full_text', text: fullText })
      }
    }

    return events
  }
}
