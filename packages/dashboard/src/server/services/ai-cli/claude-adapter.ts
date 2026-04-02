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
  NormalizedEvent,
  SpawnOptions,
  SpawnResult,
} from './types.js'
import { extractAssistantText } from './helpers.js'
import { cleanEnv } from '../../socket/env.js'

// ── Default Tool Sets ──

const WORKFLOW_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TodoWrite', 'TodoRead', 'Task']
const QUERY_TOOLS = ['Read', 'Grep', 'Glob']

export class ClaudeCodeAdapter implements AiCliAdapter {
  readonly name = 'Claude Code'
  readonly binary = 'claude'

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
