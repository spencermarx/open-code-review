/**
 * Socket.IO post-to-GitHub handler.
 *
 * Manages the "Post to GitHub" flow: checking gh auth, generating
 * human-voice reviews via the AI CLI adapter, saving drafts, and posting
 * PR comments via gh CLI.
 */

import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from 'sql.js'
import { execBinaryAsync } from '@open-code-review/platform'
import { getSession, saveDb } from '../db.js'
import { cleanEnv } from './env.js'
import { resolveLocalCli } from './cli-resolver.js'
import { AiCliService, formatToolDetail, type NormalizedEvent } from '../services/ai-cli/index.js'
import { startTrackedExecution } from './execution-tracker.js'

/** Resolve session_dir to an absolute path. CLI stores relative paths (`.ocr/sessions/...`). */
function resolveSessionDir(sessionDir: string, ocrDir: string): string {
  if (isAbsolute(sessionDir)) return sessionDir
  // Resolve relative paths against the project root (parent of `.ocr/`)
  return join(dirname(ocrDir), sessionDir)
}

/** Common git branch prefixes that use a slash separator. */
const BRANCH_PREFIXES = [
  'feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'ci',
  'build', 'perf', 'style', 'hotfix', 'release', 'bugfix',
]

/**
 * Try to find an open PR for the given branch.
 *
 * Session IDs encode the branch with hyphens (e.g. `feat-foo` for `feat/foo`),
 * so when the DB branch has no slash we also try restoring common prefixes.
 */
async function findPrForBranch(
  branch: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<{ prNumber: number; prUrl: string; resolvedBranch: string } | null> {
  const candidates = [branch]

  // If the branch has no slash, generate candidates by restoring common prefixes
  if (!branch.includes('/')) {
    for (const prefix of BRANCH_PREFIXES) {
      if (branch.startsWith(`${prefix}-`)) {
        candidates.push(`${prefix}/${branch.slice(prefix.length + 1)}`)
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const { stdout } = await execBinaryAsync(
        'gh',
        ['pr', 'list', '--head', candidate, '--json', 'number,url', '--limit', '1'],
        { env, cwd, encoding: 'utf-8' },
      )
      const prs = JSON.parse(stdout) as { number: number; url: string }[]
      if (prs.length > 0 && prs[0]) {
        return { prNumber: prs[0].number, prUrl: prs[0].url, resolvedBranch: candidate }
      }
    } catch {
      // Try next candidate
    }
  }

  return null
}

// ── Active generation processes ──

const activeGenerations = new Map<string, ChildProcess>()

/**
 * Registers post-to-GitHub socket handlers for a connected client.
 */
export function registerPostHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: Database,
  ocrDir: string,
  aiCliService: AiCliService,
): void {
  // ── Check GitHub CLI auth + find PR ──
  socket.on('post:check-gh', async (payload: { sessionId: string }) => {
    try {
      const { sessionId } = payload ?? {}
      if (typeof sessionId !== 'string') {
        socket.emit('post:gh-result', {
          authenticated: false,
          prNumber: null,
          prUrl: null,
          branch: null,
          error: 'Invalid sessionId',
        })
        return
      }

      const session = getSession(db, sessionId)
      if (!session) {
        socket.emit('post:gh-result', {
          authenticated: false,
          prNumber: null,
          prUrl: null,
          branch: null,
          error: 'Session not found',
        })
        return
      }

      const branch = session.branch

      // Check gh auth
      const repoRoot = dirname(ocrDir)
      try {
        await execBinaryAsync('gh', ['auth', 'status'], { env: cleanEnv(), cwd: repoRoot, encoding: 'utf-8' })
      } catch {
        socket.emit('post:gh-result', {
          authenticated: false,
          prNumber: null,
          prUrl: null,
          branch,
          error: 'GitHub CLI is not authenticated. Run `gh auth login` first.',
        })
        return
      }

      // Find PR for branch (tries slash-restored variants if needed)
      const pr = await findPrForBranch(branch, cleanEnv(), repoRoot)
      if (pr) {
        socket.emit('post:gh-result', {
          authenticated: true,
          prNumber: pr.prNumber,
          prUrl: pr.prUrl,
          branch: pr.resolvedBranch,
        })
      } else {
        socket.emit('post:gh-result', {
          authenticated: true,
          prNumber: null,
          prUrl: null,
          branch,
          error: `No open PR found for branch "${branch}".`,
        })
      }
    } catch (err) {
      console.error('Error in post:check-gh handler:', err)
      socket.emit('post:gh-result', {
        authenticated: false,
        prNumber: null,
        prUrl: null,
        branch: null,
        error: 'Internal error',
      })
    }
  })

  // ── Generate human review via AI CLI adapter ──
  //
  // Uses the same spawn pattern as command-runner's spawnAiCommand:
  // reads the OCR command file, builds a prompt with CLI resolution,
  // and spawns in workflow mode so the AI can locate files, read the
  // review material, and write final-human.md itself.
  socket.on('post:generate', (payload: { sessionId: string; roundNumber: number }) => {
    try {
      const { sessionId, roundNumber } = payload ?? {}
      if (typeof sessionId !== 'string' || typeof roundNumber !== 'number') {
        socket.emit('post:error', { error: 'Invalid payload' })
        return
      }

      const adapter = aiCliService.getAdapter()
      if (!adapter) {
        socket.emit('post:error', {
          error: 'No AI CLI available. Install Claude Code or OpenCode to generate human reviews.',
        })
        return
      }

      const session = getSession(db, sessionId)
      if (!session) {
        socket.emit('post:error', { error: 'Session not found' })
        return
      }

      // Quick validation: ensure the round has a completed review
      const sessionDir = session.session_dir
        ? resolveSessionDir(session.session_dir, ocrDir)
        : join(ocrDir, 'sessions', sessionId)
      const roundDir = join(sessionDir, 'rounds', `round-${roundNumber}`)
      const finalPath = join(roundDir, 'final.md')

      if (!existsSync(finalPath)) {
        socket.emit('post:error', { error: 'final.md not found for this round' })
        return
      }

      // Path used to read the result after the AI finishes
      const humanReviewPath = join(roundDir, 'final-human.md')

      // Read the OCR command file
      const repoRoot = dirname(ocrDir)
      const commandMdPath = join(ocrDir, 'commands', 'translate-review-to-single-human.md')
      let commandContent: string
      try {
        commandContent = readFileSync(commandMdPath, 'utf-8')
      } catch {
        socket.emit('post:error', {
          error: `Command file not found: ${commandMdPath}. Run \`ocr init\` to set up.`,
        })
        return
      }

      // Build prompt — same pattern as command-runner's spawnAiCommand
      const promptLines = [
        'Follow the instructions below to run the OCR translate-review-to-single-human workflow.',
        '',
        `Target: ${sessionId} --round ${roundNumber}`,
        'Options: none',
      ]

      // CLI resolution so the AI uses the correct `ocr` binary
      const localCli = resolveLocalCli()
      if (localCli) {
        promptLines.push(
          '',
          '## CLI Resolution (IMPORTANT)',
          '',
          'The `ocr` CLI may not be globally installed or may be an outdated version.',
          'For ALL `ocr` commands referenced in the instructions below, use this instead:',
          '',
          '```',
          `node ${localCli} <subcommand> [args]`,
          '```',
          '',
          'Examples:',
          `- Instead of \`ocr state show\`, run: \`node ${localCli} state show\``,
          `- Instead of \`ocr state init ...\`, run: \`node ${localCli} state init ...\``,
          `- Instead of \`ocr state transition ...\`, run: \`node ${localCli} state transition ...\``,
          '',
          'This applies to every `ocr` invocation. Do NOT use bare `ocr` commands.',
        )
      }

      promptLines.push('', '---', '', commandContent)
      const prompt = promptLines.join('\n')

      // Spawn via adapter in workflow mode (matches command-runner)
      const spawnResult = adapter.spawn({ prompt, cwd: repoRoot, mode: 'workflow' })
      const proc = spawnResult.process

      // Track process for cancellation
      const generationKey = `${sessionId}-${roundNumber}`
      activeGenerations.set(generationKey, proc)

      // Track in command_executions for active commands + history
      const tracker = startTrackedExecution(
        io, db, ocrDir,
        'ocr translate-review-to-single-human',
        [sessionId, `round-${roundNumber}`],
      )
      tracker.appendOutput('▸ Generating human-voice review...\n')

      // Parse normalized event stream — stateful parser tracks streaming
      // tool input across line boundaries so tool_call events carry the
      // full input by the time we see them.
      const parser = adapter.createParser()
      let assistantText = ''
      let lineBuffer = ''
      let thinkingStatusEmitted = false

      // ── Write-tool state ──
      // Tracks whether the AI has finished writing final-human.md so we
      // can suppress post-Write conversational text.
      let activeToolName = ''
      let writeDone = false

      // UTF-8 boundary safety — round-2 Blocker 1 (sweep completion).
      // Without setEncoding, multi-byte codepoints split across pipe
      // chunks become `�` and lines containing them fail JSON.parse,
      // silently dropping text_delta / tool_call events. post-handler
      // doesn't capture session_id (`session_id: ignored` at line 341)
      // so this isn't a capture-loss path — but the streaming UX
      // breaks the moment any vendor output contains non-ASCII content.
      proc.stdout?.setEncoding('utf-8')
      proc.stderr?.setEncoding('utf-8')

      proc.stdout?.on('data', (chunk: string) => {
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          for (const evt of parser.parseLine(line)) {
            handleEvent(evt)
          }
        }
      })

      // Track active tool name by toolId so we can detect when Write finishes.
      const toolNamesById = new Map<string, string>()

      function handleEvent(evt: NormalizedEvent): void {
        switch (evt.type) {
          case 'text_delta':
            // After the Write tool finishes, suppress conversational text
            // (e.g. "I've written the review to final-human.md")
            if (!writeDone) {
              assistantText += evt.text
              socket.emit('post:token', { token: evt.text })
            }
            break
          case 'thinking_delta':
            if (!thinkingStatusEmitted) {
              thinkingStatusEmitted = true
              socket.emit('post:status', { tool: 'thinking', detail: 'Thinking...' })
              tracker.appendOutput('▸ Thinking...\n')
            }
            break
          case 'tool_call': {
            // New tool starting — clear any accumulated reasoning text
            if (assistantText) {
              assistantText = ''
              socket.emit('post:clear-stream')
            }
            activeToolName = evt.name
            toolNamesById.set(evt.toolId, evt.name)
            const detail = formatToolDetail(evt.name, evt.input)
            socket.emit('post:status', { tool: evt.name, detail })
            tracker.appendOutput(`▸ ${detail}\n`)
            break
          }
          case 'tool_result': {
            const name = toolNamesById.get(evt.toolId)
            if (name === 'Write') writeDone = true
            activeToolName = ''
            toolNamesById.delete(evt.toolId)
            break
          }
          case 'message':
            assistantText = evt.text
            break
          // tool_input_delta, error, session_id: post-handler ignores them.
        }
      }

      let stderrBuffer = ''
      proc.stderr?.on('data', (chunk: string) => {
        stderrBuffer += chunk
      })

      proc.on('close', (code) => {
        activeGenerations.delete(generationKey)

        // Process remaining buffer
        if (lineBuffer.trim()) {
          for (const evt of parser.parseLine(lineBuffer)) {
            handleEvent(evt)
          }
        }

        // Primary: read the file the AI wrote. Fallback: use captured assistantText.
        let generatedContent = ''
        if (existsSync(humanReviewPath)) {
          try {
            generatedContent = readFileSync(humanReviewPath, 'utf-8').trim()
          } catch { /* fall through */ }
        }
        if (!generatedContent && assistantText.trim()) {
          generatedContent = assistantText.trim()
        }

        if (code === 0 && generatedContent) {
          tracker.appendOutput('\n✓ Human review generated\n')
          tracker.finish(0)
          socket.emit('post:done', { content: generatedContent })
        } else if (code === null) {
          // Process was killed (cancelled)
          tracker.appendOutput('\n✗ Cancelled\n')
          tracker.finish(-1)
          socket.emit('post:cancelled', {})
        } else {
          tracker.appendOutput(`\n✗ ${stderrBuffer || `Exit code ${code}`}\n`)
          tracker.finish(code)
          socket.emit('post:error', {
            error: stderrBuffer || `AI CLI process exited with code ${code}`,
          })
        }
      })

      proc.on('error', (err) => {
        tracker.appendOutput(`\n✗ Failed to spawn: ${err.message}\n`)
        tracker.finish(-1)
        socket.emit('post:error', {
          error: `Failed to spawn AI CLI: ${err.message}`,
        })
        activeGenerations.delete(generationKey)
      })
    } catch (err) {
      console.error('Error in post:generate handler:', err)
      socket.emit('post:error', { error: 'Internal error' })
    }
  })

  // ── Cancel generation ──
  socket.on('post:cancel', (payload: { sessionId: string; roundNumber: number }) => {
    try {
      const { sessionId, roundNumber } = payload ?? {}
      const key = `${sessionId}-${roundNumber}`
      const proc = activeGenerations.get(key)
      if (proc && !proc.killed) {
        proc.kill('SIGTERM')
      }
      activeGenerations.delete(key)
    } catch (err) {
      console.error('Error in post:cancel handler:', err)
    }
  })

  // ── Save human review draft ──
  socket.on(
    'post:save',
    (payload: { sessionId: string; roundNumber: number; content: string }) => {
      try {
        const { sessionId, roundNumber, content } = payload ?? {}
        if (
          typeof sessionId !== 'string' ||
          typeof roundNumber !== 'number' ||
          typeof content !== 'string'
        ) {
          socket.emit('post:save-result', { success: false, error: 'Invalid payload' })
          return
        }

        const MAX_CONTENT_SIZE = 1_000_000 // 1 MB
        if (content.length > MAX_CONTENT_SIZE) {
          socket.emit('post:save-result', {
            success: false,
            error: `Content too large (${content.length} chars, max ${MAX_CONTENT_SIZE})`,
          })
          return
        }

        const session = getSession(db, sessionId)
        if (!session) {
          socket.emit('post:save-result', { success: false, error: 'Session not found' })
          return
        }

        const sessionDir = session.session_dir
        ? resolveSessionDir(session.session_dir, ocrDir)
        : join(ocrDir, 'sessions', sessionId)
        const roundDir = join(sessionDir, 'rounds', `round-${roundNumber}`)
        mkdirSync(roundDir, { recursive: true })

        const filePath = join(roundDir, 'final-human.md')
        writeFileSync(filePath, content, { mode: 0o644 })

        saveDb(db, ocrDir)

        socket.emit('post:save-result', { success: true })
      } catch (err) {
        console.error('Error in post:save handler:', err)
        socket.emit('post:save-result', { success: false, error: 'Internal error' })
      }
    },
  )

  // ── Submit review to GitHub ──
  socket.on(
    'post:submit',
    async (payload: { prNumber: number; content: string }) => {
      try {
        const { prNumber, content } = payload ?? {}
        if (typeof prNumber !== 'number' || typeof content !== 'string') {
          socket.emit('post:submit-result', { success: false, error: 'Invalid payload' })
          return
        }

        // Track in command_executions
        const tracker = startTrackedExecution(
          io, db, ocrDir,
          'ocr post-to-github',
          [`PR #${prNumber}`],
        )
        tracker.appendOutput(`▸ Posting review to PR #${prNumber}...\n`)

        // Write content to temp file for --body-file
        const tmpDir = join(tmpdir(), 'ocr-post-comments')
        try { mkdirSync(tmpDir, { recursive: true, mode: 0o700 }) } catch { /* exists */ }
        const tmpFile = join(tmpDir, `${randomUUID()}.md`)
        writeFileSync(tmpFile, content, { mode: 0o600 })

        const repoRoot = dirname(ocrDir)
        try {
          const { stdout } = await execBinaryAsync(
            'gh',
            ['pr', 'comment', String(prNumber), '--body-file', tmpFile],
            { env: cleanEnv(), cwd: repoRoot, encoding: 'utf-8' },
          )

          // Try to extract the comment URL from gh output
          const urlMatch = stdout.match(/(https:\/\/github\.com\S+)/)?.[0] ?? null

          tracker.appendOutput(`✓ Posted to PR #${prNumber}${urlMatch ? ` — ${urlMatch}` : ''}\n`)
          tracker.finish(0)
          socket.emit('post:submit-result', { success: true, commentUrl: urlMatch })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error'
          tracker.appendOutput(`✗ ${errMsg}\n`)
          tracker.finish(1)
          socket.emit('post:submit-result', {
            success: false,
            error: `Failed to post comment: ${errMsg}`,
          })
        } finally {
          try { unlinkSync(tmpFile) } catch { /* ignore */ }
        }
      } catch (err) {
        console.error('Error in post:submit handler:', err)
        socket.emit('post:submit-result', { success: false, error: 'Internal error' })
      }
    },
  )
}

/**
 * Kill all active generation processes. Called during server shutdown.
 */
export function cleanupAllPostGenerations(): void {
  for (const [key, proc] of activeGenerations) {
    if (!proc.killed) {
      proc.kill('SIGTERM')
    }
    activeGenerations.delete(key)
  }
}
