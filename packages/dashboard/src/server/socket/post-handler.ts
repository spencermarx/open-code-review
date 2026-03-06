/**
 * Socket.IO post-to-GitHub handler.
 *
 * Manages the "Post to GitHub" flow: checking gh auth, generating
 * human-voice reviews via the AI CLI adapter, saving drafts, and posting
 * PR comments via gh CLI.
 */

import { execFile, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from 'sql.js'
import { getSession, saveDb } from '../db.js'
import { cleanEnv } from './env.js'
import { buildHumanReviewPrompt } from '../prompts/human-review.js'
import { AiCliService, formatToolDetail, cleanupTempFile, type NormalizedEvent } from '../services/ai-cli/index.js'
import { startTrackedExecution, type TrackedExecution } from './execution-tracker.js'

const execFileAsync = promisify(execFile)

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
      const { stdout } = await execFileAsync(
        'gh',
        ['pr', 'list', '--head', candidate, '--json', 'number,url', '--limit', '1'],
        { env },
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
      try {
        await execFileAsync('gh', ['auth', 'status'], { env: cleanEnv() })
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
      const pr = await findPrForBranch(branch, cleanEnv())
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

      // Read final.md + all reviewer outputs
      const sessionDir = session.session_dir || join(ocrDir, 'sessions', sessionId)
      const roundDir = join(sessionDir, 'rounds', `round-${roundNumber}`)
      const finalPath = join(roundDir, 'final.md')

      if (!existsSync(finalPath)) {
        socket.emit('post:error', { error: 'final.md not found for this round' })
        return
      }

      const finalContent = readFileSync(finalPath, 'utf-8')

      // Collect reviewer outputs
      const reviewerContents: { name: string; content: string }[] = []
      const reviewsDir = join(roundDir, 'reviews')
      if (existsSync(reviewsDir)) {
        const files = readdirSync(reviewsDir).filter((f) => f.endsWith('.md'))
        for (const file of files) {
          reviewerContents.push({
            name: file.replace(/\.md$/, ''),
            content: readFileSync(join(reviewsDir, file), 'utf-8'),
          })
        }
      }

      // Build prompt: try command file first, fall back to inline prompt
      let prompt: string
      const commandMdPath = join(ocrDir, 'commands', 'translate-review-to-single-human.md')
      try {
        const commandContent = readFileSync(commandMdPath, 'utf-8')

        // Build a prompt that injects the source material into the command instructions
        const promptLines = [
          'Follow the instructions below to translate this review into a single human-voice PR comment.',
          '',
          '## Source Material',
          '',
          '<final-review>',
          finalContent,
          '</final-review>',
          '',
        ]

        for (const reviewer of reviewerContents) {
          promptLines.push(
            `<reviewer-output name="${reviewer.name}">`,
            reviewer.content,
            '</reviewer-output>',
            '',
          )
        }

        promptLines.push('---', '', commandContent)
        prompt = promptLines.join('\n')
      } catch {
        // Fallback: use inline prompt if command file not found
        // (backwards compat for users who haven't run ocr update)
        prompt = buildHumanReviewPrompt(finalContent, reviewerContents)
      }

      // Spawn via the adapter
      const spawnResult = adapter.spawn({
        prompt,
        cwd: process.cwd(),
        mode: 'query',
        maxTurns: 1,
        allowedTools: ['Read', 'Grep', 'Glob'],
      })
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

      // Parse normalized event stream
      let assistantText = ''
      let lineBuffer = ''
      let thinkingStatusEmitted = false

      proc.stdout?.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString()
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          for (const evt of adapter.parseLine(line)) {
            handleEvent(evt)
          }
        }
      })

      function handleEvent(evt: NormalizedEvent): void {
        switch (evt.type) {
          case 'text':
            assistantText += evt.text
            socket.emit('post:token', { token: evt.text })
            break
          case 'thinking':
            if (!thinkingStatusEmitted) {
              thinkingStatusEmitted = true
              socket.emit('post:status', { tool: 'thinking', detail: 'Thinking...' })
              tracker.appendOutput('▸ Thinking...\n')
            }
            break
          case 'tool_start':
            if (evt.name !== '__input_json_delta') {
              const detail = formatToolDetail(evt.name, evt.input)
              socket.emit('post:status', { tool: evt.name, detail })
              tracker.appendOutput(`▸ ${detail}\n`)
            }
            break
          case 'full_text':
            assistantText = evt.text
            break
        }
      }

      let stderrBuffer = ''
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString()
      })

      proc.on('close', (code) => {
        // Clean up temp file stored on process by the adapter
        const tmpFile = (proc as unknown as { _tmpFile?: string })._tmpFile
        if (tmpFile) cleanupTempFile(tmpFile)

        activeGenerations.delete(generationKey)

        // Process remaining buffer
        if (lineBuffer.trim()) {
          for (const evt of adapter.parseLine(lineBuffer)) {
            handleEvent(evt)
          }
        }

        if (code === 0 && assistantText.trim()) {
          tracker.appendOutput('\n✓ Human review generated\n')
          tracker.finish(0)
          socket.emit('post:done', { content: assistantText.trim() })
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

        const session = getSession(db, sessionId)
        if (!session) {
          socket.emit('post:save-result', { success: false, error: 'Session not found' })
          return
        }

        const sessionDir = session.session_dir || join(ocrDir, 'sessions', sessionId)
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
        const tmpDir = join('/tmp', 'ocr-post-comments')
        try { mkdirSync(tmpDir, { recursive: true, mode: 0o700 }) } catch { /* exists */ }
        const tmpFile = join(tmpDir, `${randomUUID()}.md`)
        writeFileSync(tmpFile, content, { mode: 0o600 })

        try {
          const { stdout } = await execFileAsync(
            'gh',
            ['pr', 'comment', String(prNumber), '--body-file', tmpFile],
            { env: cleanEnv() },
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
