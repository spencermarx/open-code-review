/**
 * Claude Code adapter tests — focused on the parts that go beyond the
 * existing helpers tests: streaming tool input assembly, the new
 * thinking_delta / tool_result / error event variants, and the
 * vendor-tool-id → block-id correlator.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeAdapter } from '../claude-adapter.js'

const adapter = new ClaudeCodeAdapter()

function streamEvent(eventType: string, body: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'stream_event',
    session_id: 'sess-1',
    event: { type: eventType, ...body },
  })
}

describe('ClaudeCodeAdapter', () => {
  describe('parseLine() — convenience (stateless)', () => {
    it('returns empty for blank lines and invalid JSON', () => {
      expect(adapter.parseLine('')).toEqual([])
      expect(adapter.parseLine('garbage')).toEqual([])
      expect(adapter.parseLine('{"unbalanced')).toEqual([])
    })

    it('captures session_id from any line carrying it', () => {
      const events = adapter.parseLine(streamEvent('content_block_stop', { index: 0 }))
      expect(events).toContainEqual({ type: 'session_id', id: 'sess-1' })
    })

    it('emits text_delta for content_block_delta of type text_delta', () => {
      const events = adapter.parseLine(
        streamEvent('content_block_delta', {
          index: 0,
          delta: { type: 'text_delta', text: 'hello' },
        }),
      )
      expect(events).toContainEqual({ type: 'text_delta', text: 'hello' })
    })

    it('emits thinking_delta with the delta text (previously dropped)', () => {
      const events = adapter.parseLine(
        streamEvent('content_block_delta', {
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'Let me consider…' },
        }),
      )
      expect(events).toContainEqual({
        type: 'thinking_delta',
        text: 'Let me consider…',
      })
    })

    it('surfaces system error events as structured errors', () => {
      const line = JSON.stringify({
        type: 'system',
        subtype: 'error',
        message: 'rate limited',
      })
      const events = adapter.parseLine(line)
      expect(events).toContainEqual({
        type: 'error',
        source: 'agent',
        message: 'rate limited',
      })
    })
  })

  describe('createParser() — stateful streaming tool input assembly', () => {
    it('assembles streaming input_json_delta into a single tool_call at content_block_stop', () => {
      const parser = adapter.createParser()
      const events: ReturnType<typeof parser.parseLine>[number][] = []

      // 1. content_block_start: tool_use named "Read"
      events.push(
        ...parser.parseLine(
          streamEvent('content_block_start', {
            index: 3,
            content_block: {
              type: 'tool_use',
              id: 'toolu_abc',
              name: 'Read',
              input: {},
            },
          }),
        ),
      )

      // 2. input_json_delta: streaming partial JSON
      events.push(
        ...parser.parseLine(
          streamEvent('content_block_delta', {
            index: 3,
            delta: { type: 'input_json_delta', partial_json: '{"file_path' },
          }),
        ),
      )
      events.push(
        ...parser.parseLine(
          streamEvent('content_block_delta', {
            index: 3,
            delta: { type: 'input_json_delta', partial_json: '": "src/x.ts"}' },
          }),
        ),
      )

      // 3. content_block_stop: should now emit a single tool_call with the
      //    fully-assembled input.
      events.push(
        ...parser.parseLine(streamEvent('content_block_stop', { index: 3 })),
      )

      // Streaming deltas should be visible on the wire too — the renderer
      // can show args being typed in real time.
      const inputDeltas = events.filter((e) => e.type === 'tool_input_delta')
      expect(inputDeltas).toHaveLength(2)
      for (const evt of inputDeltas) {
        if (evt.type === 'tool_input_delta') {
          expect(evt.toolId).toBe('block-3')
        }
      }

      // The tool_call event arrives only at content_block_stop with the
      // assembled input.
      const toolCalls = events.filter((e) => e.type === 'tool_call')
      expect(toolCalls).toHaveLength(1)
      const call = toolCalls[0]!
      if (call.type === 'tool_call') {
        expect(call.toolId).toBe('block-3')
        expect(call.name).toBe('Read')
        expect(call.input).toEqual({ file_path: 'src/x.ts' })
      }
    })

    it('emits tool_result remapping the vendor tool_use_id onto block-${index}', () => {
      const parser = adapter.createParser()
      // Tool starts and finishes
      parser.parseLine(
        streamEvent('content_block_start', {
          index: 5,
          content_block: { type: 'tool_use', id: 'toolu_xyz', name: 'Bash', input: {} },
        }),
      )
      parser.parseLine(streamEvent('content_block_stop', { index: 5 }))

      // User message arrives with a tool_result keyed by the vendor id
      const userLine = JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_xyz',
              content: 'output bytes',
              is_error: false,
            },
          ],
        },
      })
      const events = parser.parseLine(userLine)

      const result = events.find((e) => e.type === 'tool_result')
      expect(result).toBeDefined()
      if (result?.type === 'tool_result') {
        // Remapped onto our block-id correlator
        expect(result.toolId).toBe('block-5')
        expect(result.output).toBe('output bytes')
        expect(result.isError).toBe(false)
      }
    })

    it('flags tool_result as error when is_error is true', () => {
      const parser = adapter.createParser()
      parser.parseLine(
        streamEvent('content_block_start', {
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_err', name: 'Bash', input: {} },
        }),
      )
      parser.parseLine(streamEvent('content_block_stop', { index: 1 }))

      const events = parser.parseLine(
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_err',
                content: 'permission denied',
                is_error: true,
              },
            ],
          },
        }),
      )
      const result = events.find((e) => e.type === 'tool_result')
      if (result?.type === 'tool_result') {
        expect(result.isError).toBe(true)
      }
    })

    it('handles tool_result content as an array of text blocks', () => {
      const parser = adapter.createParser()
      parser.parseLine(
        streamEvent('content_block_start', {
          index: 2,
          content_block: { type: 'tool_use', id: 'toolu_arr', name: 'Read', input: {} },
        }),
      )
      parser.parseLine(streamEvent('content_block_stop', { index: 2 }))

      const events = parser.parseLine(
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_arr',
                content: [
                  { type: 'text', text: 'line one\n' },
                  { type: 'text', text: 'line two\n' },
                ],
              },
            ],
          },
        }),
      )
      const result = events.find((e) => e.type === 'tool_result')
      if (result?.type === 'tool_result') {
        expect(result.output).toBe('line one\nline two\n')
      }
    })

    it('returns an independent parser per createParser() call', () => {
      const a = adapter.createParser()
      const b = adapter.createParser()
      a.parseLine(
        streamEvent('content_block_start', {
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_a', name: 'Read', input: {} },
        }),
      )
      // b's state is fresh — its block 0 isn't a tool_use.
      const bStop = b.parseLine(streamEvent('content_block_stop', { index: 0 }))
      // No tool_call should be emitted from b — there's no recorded block.
      expect(bStop.some((e) => e.type === 'tool_call')).toBe(false)
    })
  })

  describe('top-level assistant events are deduped against streamed deltas', () => {
    it('does NOT emit a `message` event from type=assistant content', () => {
      // Top-level `assistant` events are full-message snapshots that
      // duplicate the streamed `content_block_delta` text. Emitting
      // them caused the renderer to paint the same paragraph twice
      // (streamed once, snapshot once). Streaming consumers are the
      // canonical source — this is a regression guard.
      const events = adapter.parseLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'The migration looks safe.' },
            ],
          },
        }),
      )
      expect(events.some((e) => e.type === 'message')).toBe(false)
    })
  })

  // ── buildResumeArgs / buildResumeCommand (round-2 SF11 + SF13) ──
  // Pin the expected wire format. The previous round shipped a broken
  // OpenCode resume shape that substring assertions on `vendorCommand`
  // could not catch — these characterization tests close that gap.
  describe('buildResumeArgs / buildResumeCommand', () => {
    it('returns the documented Claude Code resume argv', () => {
      expect(adapter.buildResumeArgs('abc-123')).toEqual([
        '--resume',
        'abc-123',
      ])
    })

    it('returns a copy-pasteable resume command string', () => {
      expect(adapter.buildResumeCommand('abc-123')).toBe(
        'claude --resume abc-123',
      )
    })

    it('shell-quotes session ids with metacharacters', () => {
      expect(adapter.buildResumeCommand('with space & shell$')).toMatch(
        /^claude --resume '/,
      )
    })
  })

  // ── UTF-8 boundary regression (round-1 Blocker 3) ──
  //
  // The adapter's `parseLine` is line-oriented: it consumes one
  // already-assembled line at a time. The actual UTF-8 boundary issue
  // lives in command-runner where chunk assembly happens — but the
  // failure mode the boundary creates is "line containing replacement
  // characters fails JSON.parse and is silently dropped." This test
  // pins the adapter's behavior on a line that DOES contain `session_id`
  // alongside non-ASCII content, demonstrating that capture works as
  // long as the line itself is intact.
  describe('UTF-8 content does not break session_id capture', () => {
    it('extracts session_id from a line carrying emoji and accented chars', () => {
      const line = JSON.stringify({
        type: 'system',
        session_id: 'sid-utf8-✓',
        message: 'résumé 🚀 done',
      })
      const events = adapter.parseLine(line)
      expect(events).toContainEqual({ type: 'session_id', id: 'sid-utf8-✓' })
    })

    it('does not extract session_id from a line with replacement chars (drop is silent)', () => {
      // Simulates what happens when the upstream stream WAS NOT
      // setEncoding('utf-8')'d: a multi-byte codepoint splits across
      // chunks and the assembled line carries `�` characters mid-JSON.
      // JSON.parse fails and the parser correctly returns []. This
      // test demonstrates exactly what the command-runner fix prevents.
      const broken = '{"type":"system","session_id":"sid-1","note":"caf�"' // unbalanced
      expect(adapter.parseLine(broken)).toEqual([])
    })
  })

  // ── Stream-level integration test (round-2 SF3c) ──
  //
  // The adapter parses already-assembled lines. The actual UTF-8
  // boundary fix lives in command-runner / chat-handler / post-handler
  // (`proc.stdout?.setEncoding('utf-8')`). This integration test
  // proves that the same `setEncoding` strategy applied to a generic
  // stream (here: PassThrough simulating proc.stdout) successfully
  // stitches a multi-byte codepoint across chunk boundaries — and the
  // assembled line then parses cleanly. Removing setEncoding from any
  // of the four spawn sites would regress this property, but the
  // command-runner unit tests today wouldn't catch it: this test
  // closes that gap at the contract level.
  describe('stream encoding stitches UTF-8 across chunk boundaries', () => {
    it('reassembles a session_id line whose codepoint spans two chunks', async () => {
      const { PassThrough } = await import('node:stream')
      const stdout = new PassThrough()
      stdout.setEncoding('utf-8')

      let buf = ''
      const lines: string[] = []
      stdout.on('data', (chunk: string) => {
        buf += chunk
        let nl: number
        while ((nl = buf.indexOf('\n')) !== -1) {
          lines.push(buf.slice(0, nl))
          buf = buf.slice(nl + 1)
        }
      })

      // Encode a session_id line containing a multi-byte codepoint
      // (✓ = U+2713, three UTF-8 bytes: e2 9c 93). Split the byte
      // stream mid-codepoint to simulate an OS pipe boundary.
      const payload =
        JSON.stringify({ type: 'system', session_id: 'sid-✓' }) + '\n'
      const bytes = Buffer.from(payload, 'utf-8')
      const checkmarkStart = bytes.indexOf(0xe2)
      expect(checkmarkStart).toBeGreaterThan(0)
      // Split between the leading 0xe2 byte and the 0x9c continuation
      // — the worst case for naive Buffer.toString().
      stdout.write(bytes.subarray(0, checkmarkStart + 1))
      stdout.write(bytes.subarray(checkmarkStart + 1))
      stdout.end()

      await new Promise<void>((resolve) => stdout.once('end', resolve))

      expect(lines).toHaveLength(1)
      const parsed = JSON.parse(lines[0]!) as { session_id: string }
      expect(parsed.session_id).toBe('sid-✓')
      // And the adapter still picks up the session_id from the
      // re-assembled line.
      expect(adapter.parseLine(lines[0]!)).toContainEqual({
        type: 'session_id',
        id: 'sid-✓',
      })
    })
  })
})
