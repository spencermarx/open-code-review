/**
 * Shared helpers for AI CLI adapters.
 *
 * Consolidates utility functions that were previously duplicated across
 * command-runner.ts, chat-handler.ts, and post-handler.ts.
 */

import { mkdirSync, writeFileSync, unlinkSync, openSync, closeSync } from 'node:fs'
import type { ChildProcess, StdioOptions } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

// ── File-stdio plumbing (shared by the Claude + OpenCode adapters) ──

/**
 * Build the `stdio` triple for a workflow spawn. When `logFile` is set, stdout
 * AND stderr are redirected to that FILE (the file-stdio wedge fix — a leaked
 * grandchild inheriting fd 1/2 holds no pipe whose EOF the dashboard waits on);
 * the caller tails it. Otherwise both are pipes. stdin is always a pipe: BOTH
 * vendors receive the prompt on stdin via {@link deliverPrompt} — the prompt
 * must never appear in argv (issue #43: injection surface under the old
 * Windows shell:true spawning, cmd.exe's ~8191-char command-line limit, and
 * prompt visibility in process listings).
 *
 * Returns the open `logFd` (the caller MUST `closeFileStdio` it after spawn —
 * the child has dup'd it) and `logPath` for the SpawnResult.
 */
export function buildFileStdio(
  logFile: string | undefined,
): { stdio: StdioOptions; logFd: number | null; logPath: string | undefined } {
  if (!logFile) {
    return { stdio: ['pipe', 'pipe', 'pipe'], logFd: null, logPath: undefined }
  }
  // 0o600: per-execution logs are owner-only — the child-env design's
  // stated posture for exec logs (previously umask-governed by default).
  const logFd = openSync(logFile, 'a', 0o600)
  return { stdio: ['pipe', logFd, logFd], logFd, logPath: logFile }
}

/**
 * Pre-spawn guard: reject an empty prompt BEFORE any process is created.
 *
 * OpenCode errors on an empty message and a missing prompt is always a caller
 * bug, but the load-bearing reason this runs *before* `spawnBinary` is that a
 * workflow spawn is `detached` + `unref`'d: if validation waited until
 * {@link deliverPrompt} (which runs after the spawn) the child would already be
 * a live, untracked, orphaned process by the time we threw. Call this at the
 * top of every adapter `spawn()` so an empty prompt never reaches the OS
 * (issue #43 review, blocker B1).
 */
export function assertNonEmptyPrompt(prompt: string): void {
  if (prompt.length === 0) {
    throw new Error('refusing to spawn with an empty prompt')
  }
}

/**
 * Deliver the prompt to a freshly spawned vendor child over stdin.
 *
 * An `error` handler is attached BEFORE writing: if the child dies before
 * draining stdin (binary errors at startup, AV kill, …), Node emits EPIPE on
 * the stream — unhandled, that throws out of the write and can crash the
 * dashboard server. The error is swallowed by design: a dead child is
 * detected and reported by the existing close/result/watchdog machinery,
 * not by the prompt writer.
 *
 * The empty-prompt check is kept here as cheap defense-in-depth, but the
 * authoritative gate is {@link assertNonEmptyPrompt}, called before the spawn —
 * by the time we reach here the (detached) child already exists, so throwing
 * now would orphan it.
 */
export function deliverPrompt(proc: ChildProcess, prompt: string): void {
  // Defense-in-depth, but route through the SAME predicate as the pre-spawn
  // gate so a future relaxation of "what counts as empty" can't drift between
  // the two call sites.
  assertNonEmptyPrompt(prompt)
  proc.stdin?.on('error', () => {
    /* EPIPE etc. — the close/watchdog path owns failure reporting */
  })
  proc.stdin?.write(prompt)
  proc.stdin?.end()
}

/** Close the parent's copy of the log fd after spawn (best-effort). */
export function closeFileStdio(logFd: number | null): void {
  if (logFd === null) return
  try {
    closeSync(logFd)
  } catch {
    /* best-effort */
  }
}

// ── Tool Detail Formatting ──
// Converts tool_use blocks into human-readable terminal lines.

export function formatToolDetail(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
      return `Reading ${input['file_path'] ?? 'file'}`
    case 'Write':
      return `Writing ${input['file_path'] ?? 'file'}`
    case 'Edit':
      return `Editing ${input['file_path'] ?? 'file'}`
    case 'Grep':
      return `Searching for "${input['pattern'] ?? '...'}"`
    case 'Glob':
      return `Finding files matching ${input['pattern'] ?? '...'}`
    case 'Bash': {
      let cmd = (input['command'] as string) ?? '...'
      // Strip "cd /long/path && " prefix — the cwd is already known
      cmd = cmd.replace(/^cd\s+\S+\s*&&\s*/, '')
      return `Running: ${cmd.slice(0, 120)}`
    }
    case 'Agent':
      return `Spawning agent: ${input['description'] ?? '...'}`
    default:
      return `Using ${tool}`
  }
}

// ── Assistant Text Extraction ──
// Extracts concatenated text from a complete Claude Code assistant message.

export function extractAssistantText(parsed: Record<string, unknown>): string {
  const msg = parsed['message'] as Record<string, unknown> | undefined
  const content = msg?.['content'] as Array<Record<string, unknown>> | undefined
  if (!content) return ''

  let text = ''
  for (const block of content) {
    if (block['type'] === 'text' && typeof block['text'] === 'string') {
      text += block['text']
    }
  }
  return text
}

// ── Temp File Management ──
// Writes prompts to secure temp files and provides cleanup.

const TEMP_BASE = join(tmpdir(), 'ocr-ai-prompts')

export function writeTempPrompt(prompt: string): string {
  try { mkdirSync(TEMP_BASE, { recursive: true, mode: 0o700 }) } catch { /* exists */ }
  const tmpFile = join(TEMP_BASE, `${randomUUID()}.txt`)
  writeFileSync(tmpFile, prompt, { mode: 0o600 })
  return tmpFile
}

export function cleanupTempFile(path: string): void {
  try { unlinkSync(path) } catch { /* ignore */ }
}
