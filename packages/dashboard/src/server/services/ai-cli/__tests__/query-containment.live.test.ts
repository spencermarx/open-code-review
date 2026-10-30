/**
 * Live check of Claude Code query-mode restriction against the REAL `claude`
 * binary and the developer's own user-level settings, in a throwaway repo that
 * carries project-level Claude Code configuration of its own.
 *
 * Opt-in: `OCR_LIVE_VENDOR_TESTS=1 pnpm nx test dashboard` (needs an installed,
 * authenticated `claude` >= the containment floor). The child is killed as soon
 * as its `init` event reports the tool set and permission mode, before any
 * model turn; it asserts nothing about the model's reply.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeCodeAdapter } from '../claude-adapter.js'
import { initChildEnvBase, resetChildEnvBaseForTests, captureChildEnvBase } from '../../../child-env.js'

type InitEvent = { tools: string[]; permissionMode: string; mcp_servers: unknown[] }

function readInit(adapter: ClaudeCodeAdapter, cwd: string): Promise<InitEvent> {
  const { process: proc } = adapter.spawn({
    prompt: 'Summarize this repository in one sentence.',
    cwd,
    mode: 'query',
    model: 'haiku',
  })
  return new Promise((resolve, reject) => {
    let buffer = ''
    let stderr = ''
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      proc.kill('SIGKILL')
      fn()
    }
    const timer = setTimeout(() => settle(() => reject(new Error('no init event within 60s'))), 60_000)
    proc.stdout?.setEncoding('utf-8')
    proc.stderr?.setEncoding('utf-8')
    proc.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    proc.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as Record<string, unknown>
          if (event['type'] === 'system' && event['subtype'] === 'init') {
            settle(() => resolve(event as unknown as InitEvent))
            return
          }
        } catch {
          // non-JSON line
        }
      }
    })
    proc.on('close', (code) =>
      settle(() => reject(new Error(`claude exited (${code}) before init: ${stderr.trim()}`))),
    )
    proc.on('error', (err) => settle(() => reject(err)))
  })
}

describe.skipIf(process.env['OCR_LIVE_VENDOR_TESTS'] !== '1')('live: Claude Code query-mode tool set', () => {
  let repo: string

  beforeAll(() => {
    resetChildEnvBaseForTests()
    initChildEnvBase(captureChildEnvBase('dev-direct-run'))
    repo = mkdtempSync(join(tmpdir(), 'ocr-query-mode-'))
    mkdirSync(join(repo, '.claude'))
    writeFileSync(
      join(repo, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Write'] } }),
    )
    writeFileSync(join(repo, '.mcp.json'), JSON.stringify({ mcpServers: { local: { command: 'true' } } }))
  })

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('offers only Read, Grep and Glob, under dontAsk, with no MCP servers', async () => {
    const init = await readInit(new ClaudeCodeAdapter(), repo)
    expect([...init.tools].sort()).toEqual(['Glob', 'Grep', 'Read'])
    expect(init.permissionMode).toBe('dontAsk')
    expect(init.mcp_servers).toEqual([])
  }, 90_000)
})
