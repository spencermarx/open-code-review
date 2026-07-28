import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatToolDetail, extractAssistantText, buildFileStdio, closeFileStdio } from '../helpers.js'

// ── formatToolDetail ─────────────────────────────────────────────────────────

describe('formatToolDetail', () => {
  it('formats Read tool with file_path', () => {
    const result = formatToolDetail('Read', { file_path: 'src/index.ts' })
    expect(result).toBe('Reading src/index.ts')
  })

  it('formats Read tool with fallback when file_path is missing', () => {
    const result = formatToolDetail('Read', {})
    expect(result).toBe('Reading file')
  })

  it('formats Write tool with file_path', () => {
    const result = formatToolDetail('Write', { file_path: 'dist/output.js' })
    expect(result).toBe('Writing dist/output.js')
  })

  it('formats Write tool with fallback when file_path is missing', () => {
    const result = formatToolDetail('Write', {})
    expect(result).toBe('Writing file')
  })

  it('formats Edit tool with file_path', () => {
    const result = formatToolDetail('Edit', { file_path: 'src/utils.ts' })
    expect(result).toBe('Editing src/utils.ts')
  })

  it('formats Edit tool with fallback when file_path is missing', () => {
    const result = formatToolDetail('Edit', {})
    expect(result).toBe('Editing file')
  })

  it('formats Grep tool with pattern', () => {
    const result = formatToolDetail('Grep', { pattern: 'TODO' })
    expect(result).toBe('Searching for "TODO"')
  })

  it('formats Grep tool with fallback when pattern is missing', () => {
    const result = formatToolDetail('Grep', {})
    expect(result).toBe('Searching for "..."')
  })

  it('formats Glob tool with pattern', () => {
    const result = formatToolDetail('Glob', { pattern: '**/*.ts' })
    expect(result).toBe('Finding files matching **/*.ts')
  })

  it('formats Glob tool with fallback when pattern is missing', () => {
    const result = formatToolDetail('Glob', {})
    expect(result).toBe('Finding files matching ...')
  })

  it('formats Bash tool with command', () => {
    const result = formatToolDetail('Bash', { command: 'npm test' })
    expect(result).toBe('Running: npm test')
  })

  it('formats Bash tool and strips cd prefix', () => {
    const result = formatToolDetail('Bash', { command: 'cd /home/user/project && npm test' })
    expect(result).toBe('Running: npm test')
  })

  it('formats Bash tool and truncates long commands to 120 chars', () => {
    const longCmd = 'echo ' + 'a'.repeat(200)
    const result = formatToolDetail('Bash', { command: longCmd })
    // "Running: " prefix + truncated command
    expect(result).toBe('Running: ' + longCmd.slice(0, 120))
  })

  it('formats Bash tool with fallback when command is missing', () => {
    const result = formatToolDetail('Bash', {})
    expect(result).toBe('Running: ...')
  })

  it('formats Agent tool with description', () => {
    const result = formatToolDetail('Agent', { description: 'Analyze code quality' })
    expect(result).toBe('Spawning agent: Analyze code quality')
  })

  it('formats Agent tool with fallback when description is missing', () => {
    const result = formatToolDetail('Agent', {})
    expect(result).toBe('Spawning agent: ...')
  })

  it('formats unknown tool names with a generic message', () => {
    const result = formatToolDetail('CustomTool', { foo: 'bar' })
    expect(result).toBe('Using CustomTool')
  })

  it('formats unknown tool even with empty input', () => {
    const result = formatToolDetail('UnknownWidget', {})
    expect(result).toBe('Using UnknownWidget')
  })
})

// ── extractAssistantText ─────────────────────────────────────────────────────

describe('extractAssistantText', () => {
  it('extracts text from a single text block', () => {
    const parsed = {
      message: {
        content: [
          { type: 'text', text: 'Hello, world!' },
        ],
      },
    }
    expect(extractAssistantText(parsed)).toBe('Hello, world!')
  })

  it('concatenates text from multiple text blocks', () => {
    const parsed = {
      message: {
        content: [
          { type: 'text', text: 'Part one. ' },
          { type: 'text', text: 'Part two.' },
        ],
      },
    }
    expect(extractAssistantText(parsed)).toBe('Part one. Part two.')
  })

  it('ignores non-text blocks', () => {
    const parsed = {
      message: {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
          { type: 'text', text: ' world' },
        ],
      },
    }
    expect(extractAssistantText(parsed)).toBe('Hello world')
  })

  it('returns empty string when message is missing', () => {
    expect(extractAssistantText({})).toBe('')
  })

  it('returns empty string when content is missing', () => {
    const parsed = { message: {} }
    expect(extractAssistantText(parsed)).toBe('')
  })

  it('returns empty string when content is an empty array', () => {
    const parsed = { message: { content: [] } }
    expect(extractAssistantText(parsed)).toBe('')
  })

  it('returns empty string when content has only non-text blocks', () => {
    const parsed = {
      message: {
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'Bash', input: {} },
        ],
      },
    }
    expect(extractAssistantText(parsed)).toBe('')
  })

  it('ignores blocks where text field is not a string', () => {
    const parsed = {
      message: {
        content: [
          { type: 'text', text: 123 },
          { type: 'text', text: 'valid' },
        ],
      },
    }
    expect(extractAssistantText(parsed)).toBe('valid')
  })

  it('handles text blocks with empty strings', () => {
    const parsed = {
      message: {
        content: [
          { type: 'text', text: '' },
          { type: 'text', text: 'content' },
        ],
      },
    }
    expect(extractAssistantText(parsed)).toBe('content')
  })
})

// ── buildFileStdio ───────────────────────────────────────────────────────────

describe('buildFileStdio', () => {
  it('creates the exec log owner-only (0o600) on POSIX', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ocr-filestdio-test-'))
    const logFile = join(dir, 'exec.log')
    const { logFd, logPath } = buildFileStdio(logFile)
    try {
      expect(logPath).toBe(logFile)
      if (process.platform !== 'win32') {
        expect(statSync(logFile).mode & 0o777).toBe(0o600)
      }
    } finally {
      closeFileStdio(logFd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns all-pipe stdio with no fd when logFile is undefined', () => {
    const { stdio, logFd, logPath } = buildFileStdio(undefined)
    expect(stdio).toEqual(['pipe', 'pipe', 'pipe'])
    expect(logFd).toBeNull()
    expect(logPath).toBeUndefined()
  })
})
