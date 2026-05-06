import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenCodeAdapter } from '../opencode-adapter.js'

describe('OpenCodeAdapter', () => {
  const adapter = new OpenCodeAdapter()

  describe('metadata', () => {
    it('has correct name and binary', () => {
      expect(adapter.name).toBe('OpenCode')
      expect(adapter.binary).toBe('opencode')
    })
  })

  describe('detect()', () => {
    it('returns found: false when opencode is not installed', () => {
      // On CI / most dev machines without opencode installed,
      // detect() should gracefully return found: false
      const result = adapter.detect()
      // We can't guarantee opencode is installed, so just verify the shape
      expect(result).toHaveProperty('found')
      expect(typeof result.found).toBe('boolean')
      if (result.found) {
        expect(result.version).toBeDefined()
      }
    })
  })

  describe('parseLine()', () => {
    it('returns empty array for blank lines', () => {
      expect(adapter.parseLine('')).toEqual([])
      expect(adapter.parseLine('   ')).toEqual([])
    })

    it('returns empty array for invalid JSON', () => {
      expect(adapter.parseLine('not json')).toEqual([])
      expect(adapter.parseLine('{broken')).toEqual([])
    })

    it('captures sessionID from every event', () => {
      const line = JSON.stringify({
        type: 'text',
        timestamp: Date.now(),
        sessionID: 'sess-abc-123',
        part: { type: 'text', text: 'hello' },
      })
      const events = adapter.parseLine(line)
      expect(events).toContainEqual({ type: 'session_id', id: 'sess-abc-123' })
    })

    it('parses text events into a single message event', () => {
      const line = JSON.stringify({
        type: 'text',
        timestamp: Date.now(),
        sessionID: 's1',
        part: { type: 'text', text: 'Hello world', time: { start: 1, end: 2 } },
      })
      const events = adapter.parseLine(line)
      expect(events).toContainEqual({ type: 'message', text: 'Hello world' })
    })

    it('skips text events with empty text', () => {
      const line = JSON.stringify({
        type: 'text',
        timestamp: Date.now(),
        sessionID: 's1',
        part: { type: 'text', text: '', time: { end: 1 } },
      })
      const events = adapter.parseLine(line)
      // Should have session_id but no message
      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('session_id')
    })

    it('parses tool_use events into tool_call + tool_result with capitalized name', () => {
      const line = JSON.stringify({
        type: 'tool_use',
        timestamp: Date.now(),
        sessionID: 's1',
        part: {
          type: 'tool',
          tool: 'bash',
          callID: 'call-1',
          state: { status: 'completed', output: 'ok' },
          input: { command: 'ls -la' },
        },
      })
      const events = adapter.parseLine(line)
      expect(events).toContainEqual({
        type: 'tool_call',
        toolId: 'call-1',
        name: 'Bash',
        input: { command: 'ls -la' },
      })
      expect(events).toContainEqual({
        type: 'tool_result',
        toolId: 'call-1',
        output: 'ok',
        isError: false,
      })
    })

    it('capitalizes various tool names correctly', () => {
      const tools = ['read', 'write', 'edit', 'glob', 'grep', 'webfetch']
      const expected = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Webfetch']

      tools.forEach((tool, i) => {
        const line = JSON.stringify({
          type: 'tool_use',
          timestamp: Date.now(),
          sessionID: 's1',
          part: { type: 'tool', tool, callID: `c-${i}`, state: { status: 'completed' }, input: {} },
        })
        const events = adapter.parseLine(line)
        const call = events.find((e) => e.type === 'tool_call')
        expect(call).toBeDefined()
        if (call?.type === 'tool_call') {
          expect(call.name).toBe(expected[i])
        }
      })
    })

    it('extracts input from direct part.input', () => {
      const line = JSON.stringify({
        type: 'tool_use',
        timestamp: Date.now(),
        sessionID: 's1',
        part: {
          type: 'tool',
          tool: 'read',
          callID: 'c1',
          state: { status: 'completed' },
          input: { file_path: '/src/index.ts' },
        },
      })
      const events = adapter.parseLine(line)
      const call = events.find((e) => e.type === 'tool_call')
      expect(call).toBeDefined()
      if (call?.type === 'tool_call') {
        expect(call.input).toEqual({ file_path: '/src/index.ts' })
      }
    })

    it('falls back to state.input when direct input is missing', () => {
      const line = JSON.stringify({
        type: 'tool_use',
        timestamp: Date.now(),
        sessionID: 's1',
        part: {
          type: 'tool',
          tool: 'write',
          callID: 'c1',
          state: { status: 'completed', input: { file_path: '/out.txt' } },
        },
      })
      const events = adapter.parseLine(line)
      const call = events.find((e) => e.type === 'tool_call')
      if (call?.type === 'tool_call') {
        expect(call.input).toEqual({ file_path: '/out.txt' })
      }
    })

    it('returns empty input when no input found', () => {
      const line = JSON.stringify({
        type: 'tool_use',
        timestamp: Date.now(),
        sessionID: 's1',
        part: {
          type: 'tool',
          tool: 'unknown_tool',
          callID: 'c1',
          state: { status: 'completed' },
        },
      })
      const events = adapter.parseLine(line)
      const call = events.find((e) => e.type === 'tool_call')
      if (call?.type === 'tool_call') {
        expect(call.input).toEqual({})
      }
    })

    it('marks tool_result as error when state.status is error', () => {
      const line = JSON.stringify({
        type: 'tool_use',
        timestamp: Date.now(),
        sessionID: 's1',
        part: {
          type: 'tool',
          tool: 'bash',
          callID: 'c-err',
          state: { status: 'error', output: 'permission denied' },
          input: { command: 'rm /' },
        },
      })
      const events = adapter.parseLine(line)
      expect(events).toContainEqual({
        type: 'tool_result',
        toolId: 'c-err',
        output: 'permission denied',
        isError: true,
      })
    })

    it('parses reasoning events as thinking_delta with the reasoning text', () => {
      const line = JSON.stringify({
        type: 'reasoning',
        timestamp: Date.now(),
        sessionID: 's1',
        part: { type: 'reasoning', text: 'Let me think about this...' },
      })
      const events = adapter.parseLine(line)
      expect(events).toContainEqual({
        type: 'thinking_delta',
        text: 'Let me think about this...',
      })
    })

    it('ignores step_start events (intra-process phases, not sub-agents)', () => {
      const line = JSON.stringify({
        type: 'step_start',
        timestamp: Date.now(),
        sessionID: 's1',
        part: { type: 'step-start' },
      })
      const events = adapter.parseLine(line)
      // Only session_id should be present
      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('session_id')
    })

    it('ignores step_finish events (intra-process phases, not sub-agents)', () => {
      const line = JSON.stringify({
        type: 'step_finish',
        timestamp: Date.now(),
        sessionID: 's1',
        part: { type: 'step-finish' },
      })
      const events = adapter.parseLine(line)
      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('session_id')
    })

    it('surfaces top-level error events as structured error events', () => {
      const line = JSON.stringify({
        type: 'error',
        timestamp: Date.now(),
        sessionID: 's1',
        error: { message: 'Something went wrong', detail: 'rate limit' },
      })
      const events = adapter.parseLine(line)
      // session_id + error
      expect(events).toHaveLength(2)
      expect(events).toContainEqual({
        type: 'error',
        source: 'agent',
        message: 'Something went wrong',
        detail: 'rate limit',
      })
    })

    it('handles events without sessionID', () => {
      const line = JSON.stringify({
        type: 'text',
        timestamp: Date.now(),
        part: { type: 'text', text: 'no session' },
      })
      const events = adapter.parseLine(line)
      expect(events).not.toContainEqual(expect.objectContaining({ type: 'session_id' }))
      expect(events).toContainEqual({ type: 'message', text: 'no session' })
    })

    it('handles tool_use without part (malformed)', () => {
      const line = JSON.stringify({
        type: 'tool_use',
        timestamp: Date.now(),
        sessionID: 's1',
      })
      const events = adapter.parseLine(line)
      // Only session_id, no tool events
      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('session_id')
    })
  })

  describe('spawn()', () => {
    // We can't easily test spawn() without mocking child_process,
    // but we can verify the method exists and has the right shape
    it('is a function', () => {
      expect(typeof adapter.spawn).toBe('function')
    })
  })

  // ── buildResumeArgs / buildResumeCommand (round-2 SF11 + SF13) ──
  // Pin the corrected shape. The previous shape was
  //   `opencode run "" --session <id> --continue`
  // which OpenCode's `run` parser rejects on the empty positional.
  // These tests would have caught Blocker 1 if they had existed pre-merge.
  describe('buildResumeArgs / buildResumeCommand', () => {
    it('returns OpenCode interactive-resume argv (no `run` subcommand, no empty positional)', () => {
      expect(adapter.buildResumeArgs('xyz-789')).toEqual([
        '--session',
        'xyz-789',
      ])
    })

    it('produces a shell command without an empty positional', () => {
      const cmd = adapter.buildResumeCommand('xyz-789')
      expect(cmd).toBe('opencode --session xyz-789')
      // Regression guard for Blocker 1: never ship the broken shape.
      expect(cmd).not.toMatch(/run\s+""/)
      expect(cmd).not.toMatch(/run\s+''/)
    })

    it('shell-quotes session ids with metacharacters', () => {
      expect(adapter.buildResumeCommand('id with space')).toMatch(
        /^opencode --session '/,
      )
    })
  })
})
