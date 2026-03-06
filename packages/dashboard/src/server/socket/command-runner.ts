/**
 * Socket.IO command execution handler.
 *
 * Spawns CLI commands as child processes, streams output via socket events,
 * and logs execution to the command_executions table.
 *
 * Supports two command types:
 * - Utility commands (progress, state): spawned via the local OCR CLI
 * - AI workflow commands (map, review): spawned via Claude Code headless mode
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from 'sql.js'
import { saveDb } from '../db.js'
import { resolveLocalCli } from './cli-resolver.js'
import { cleanEnv } from './env.js'

// ── Types ──

interface CommandRunPayload {
  command: string
  args?: string[]
}

interface CommandStartedEvent {
  execution_id: number
  command: string
  args: string[]
  started_at: string
}

// ── Whitelist ──
// Base OCR subcommands that are allowed to run from the dashboard.
// The client sends the full command string (e.g., "ocr state show"),
// and we validate the first subcommand (e.g., "state") against this set.

const ALLOWED_COMMANDS = new Set([
  'progress',
  'state',
])

/** AI workflow commands — spawned via Claude Code headless mode. */
const AI_COMMANDS = new Set(['map', 'review'])

// ── State ──

const MAX_CONCURRENT = 3

interface ProcessEntry {
  process: ChildProcess
  executionId: number
  outputBuffer: string
  commandStr: string
  startedAt: string
  /** Whether the process was spawned with detached: true (supports process group kill). */
  detached: boolean
}

/** Active commands keyed by execution_id */
const activeCommands = new Map<number, ProcessEntry>()

/**
 * Returns whether any command is currently running.
 */
export function isCommandRunning(): boolean {
  return activeCommands.size > 0
}

/**
 * Returns the number of currently running commands.
 */
export function getRunningCount(): number {
  return activeCommands.size
}

export interface ActiveCommandInfo {
  execution_id: number
  command: string
  started_at: string
  output: string
}

/**
 * Returns metadata and output for all currently running commands.
 */
export function getActiveCommands(): ActiveCommandInfo[] {
  return Array.from(activeCommands.values()).map((entry) => ({
    execution_id: entry.executionId,
    command: entry.commandStr,
    started_at: entry.startedAt,
    output: entry.outputBuffer,
  }))
}

/**
 * Registers the `command:run` socket handler for a connected client.
 */
export function registerCommandHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: Database,
  ocrDir: string
): void {
  socket.on('command:run', (payload: CommandRunPayload) => {
    try {
      if (typeof payload?.command !== 'string') {
        socket.emit('command:error', {
          error: 'Invalid payload: command must be a string',
        })
        return
      }

      const { command } = payload

      // Parse the command string — strip leading "ocr " if present
      const normalized = command.replace(/^ocr\s+/, '')
      const parts = normalized.split(/\s+/)
      const baseCommand = parts[0] ?? ''
      const subArgs = parts.slice(1)

      // Validate base command against whitelist (utility + AI)
      if (!ALLOWED_COMMANDS.has(baseCommand) && !AI_COMMANDS.has(baseCommand)) {
        socket.emit('command:error', {
          error: `Command "${command}" is not allowed`,
          allowed: [...ALLOWED_COMMANDS, ...AI_COMMANDS].map((c) => `ocr ${c}`),
        })
        return
      }

      // Concurrent command guard
      if (activeCommands.size >= MAX_CONCURRENT) {
        socket.emit('command:error', {
          error: `Maximum ${MAX_CONCURRENT} concurrent commands allowed`,
          running: Array.from(activeCommands.values()).map((e) => ({
            execution_id: e.executionId,
            command: e.commandStr,
          })),
        })
        return
      }

      // Insert execution record
      const startedAt = new Date().toISOString()
      db.run(
        `INSERT INTO command_executions (command, args, started_at)
         VALUES (?, ?, ?)`,
        [command, JSON.stringify(subArgs), startedAt]
      )
      const idResult = db.exec('SELECT last_insert_rowid() as id')
      const executionId = (idResult[0]?.values[0]?.[0] as number) ?? 0

      const isAi = AI_COMMANDS.has(baseCommand)
      const entry: ProcessEntry = {
        process: null!,
        executionId: executionId,
        outputBuffer: '',
        commandStr: command,
        startedAt: startedAt,
        detached: isAi,
      }
      activeCommands.set(executionId, entry)

      // Emit started event
      const startedEvent: CommandStartedEvent = {
        execution_id: executionId,
        command,
        args: subArgs,
        started_at: startedAt,
      }
      io.emit('command:started', startedEvent)

      // Emit warning so the client can show a confirmation dialog
      io.emit('command:warning', {
        execution_id: executionId,
        message:
          'This command runs an AI agent with full file system and shell access in your project directory. Only run commands you trust.',
      })

      // Route to appropriate spawn path
      if (AI_COMMANDS.has(baseCommand)) {
        spawnAiCommand(io, socket, db, ocrDir, executionId, baseCommand, subArgs, entry)
      } else {
        spawnCliCommand(io, db, ocrDir, executionId, baseCommand, subArgs, entry)
      }
    } catch (err) {
      console.error('Error in command:run handler:', err)
      socket.emit('error', { message: 'Internal error' })
    }
  })

  // Allow cancelling a running command by execution_id.
  // Kill the entire process group (sh + cat + claude pipeline) and
  // escalate to SIGKILL if the process doesn't exit within 5 seconds.
  socket.on('command:cancel', (payload?: { execution_id?: number }) => {
    try {
      const targetId = payload?.execution_id
      if (!targetId) return

      const entry = activeCommands.get(targetId)
      if (!entry) return

      const proc = entry.process
      const pid = proc.pid

      // Only use process group kill (-pid) for detached processes (AI commands).
      // Non-detached utility commands should be killed directly via proc.kill().
      if (entry.detached && pid) {
        try { process.kill(-pid, 'SIGTERM') } catch { proc.kill('SIGTERM') }
      } else {
        proc.kill('SIGTERM')
      }

      // Escalate to SIGKILL after timeout
      const killTimer = setTimeout(() => {
        if (!activeCommands.has(targetId)) return
        if (entry.detached && pid) {
          try { process.kill(-pid, 'SIGKILL') } catch { /* already dead */ }
        }
        proc.kill('SIGKILL')
      }, 5000)

      // Clear timer when process exits
      proc.once('close', () => clearTimeout(killTimer))
    } catch (err) {
      console.error('Error in command:cancel handler:', err)
      socket.emit('error', { message: 'Internal error' })
    }
  })
}

// ── Utility command spawn (existing path) ──

function spawnCliCommand(
  io: SocketIOServer,
  db: Database,
  ocrDir: string,
  executionId: number,
  baseCommand: string,
  subArgs: string[],
  entry: ProcessEntry
): void {
  const localCli = resolveLocalCli()
  const proc = localCli
    ? spawn('node', [localCli, baseCommand, ...subArgs], {
        cwd: process.cwd(),
        env: { ...process.env },
      })
    : spawn('ocr', [baseCommand, ...subArgs], {
        cwd: process.cwd(),
        env: { ...process.env },
      })
  entry.process = proc

  proc.stdout?.on('data', (chunk: Buffer) => {
    const content = chunk.toString()
    entry.outputBuffer += content
    io.emit('command:output', { execution_id: executionId, content })
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    const content = chunk.toString()
    entry.outputBuffer += content
    io.emit('command:output', { execution_id: executionId, content })
  })

  proc.on('close', (code) => {
    finishExecution(io, db, ocrDir, executionId, code, entry.outputBuffer)
  })

  proc.on('error', (err) => {
    entry.outputBuffer += `Process error: ${err.message}`
    finishExecution(io, db, ocrDir, executionId, -1, entry.outputBuffer)
  })
}

// ── AI workflow command spawn (Claude headless) ──

function spawnAiCommand(
  io: SocketIOServer,
  _socket: Socket,
  db: Database,
  ocrDir: string,
  executionId: number,
  baseCommand: string,
  subArgs: string[],
  entry: ProcessEntry
): void {
  // 1. Read the command .md file
  const commandMdPath = join(ocrDir, 'commands', `${baseCommand}.md`)
  let commandContent: string
  try {
    commandContent = readFileSync(commandMdPath, 'utf-8')
  } catch {
    const content = `Error: Could not read command file at ${commandMdPath}\n`
    io.emit('command:output', { execution_id: executionId, content })
    finishExecution(io, db, ocrDir, executionId, 1, content)
    return
  }

  // 2. Parse subArgs for target, --fresh, --requirements
  let target = 'staged changes'
  let requirements = ''
  const options: string[] = []
  let i = 0
  while (i < subArgs.length) {
    const arg = subArgs[i] ?? ''
    if (arg === '--fresh') {
      options.push('--fresh')
      i++
    } else if (arg === '--requirements' && i + 1 < subArgs.length) {
      // Consume all remaining args as the requirements value
      // (supports both file paths and multi-word natural language)
      requirements = subArgs.slice(i + 1).join(' ')
      break
    } else if (!arg.startsWith('--')) {
      target = arg
      i++
    } else {
      i++
    }
  }

  // 3. Build prompt
  const optionsStr = options.length > 0 ? options.join(' ') : 'none'
  const promptLines = [
    `Follow the instructions below to run the OCR ${baseCommand} workflow.`,
    '',
    `Target: ${target}`,
    `Options: ${optionsStr}`,
  ]
  if (requirements) {
    promptLines.push(`Requirements: ${requirements}`)
  }

  // Resolve the local CLI so the spawned Claude uses the correct version.
  // The globally-installed `ocr` may be absent or outdated; resolveLocalCli()
  // finds the monorepo or production-bundled entry point dynamically.
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

  // 4. Write prompt to temp file
  const tmpDir = join('/tmp', 'ocr-cmd-prompts')
  try { mkdirSync(tmpDir, { recursive: true, mode: 0o700 }) } catch { /* exists */ }
  const tmpFile = join(tmpDir, `${randomUUID()}.txt`)
  writeFileSync(tmpFile, prompt, { mode: 0o600 })

  // 5. Build Claude CLI flags
  // --allowedTools pre-authorizes tool use since --print mode is non-interactive
  // (no user to approve permission prompts)
  const flags = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--max-turns', '50',
    '--allowedTools',
    'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
    'TodoWrite', 'TodoRead',
  ]

  // 6. Spawn via cat pipe to avoid shell escaping issues
  const flagStr = flags.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(' ')
  const shellCmd = `cat '${tmpFile}' | claude ${flagStr}`

  // Use the repo root (parent of .ocr/) as cwd so Claude can access all project files
  const repoRoot = dirname(ocrDir)

  const proc = spawn('sh', ['-c', shellCmd], {
    cwd: repoRoot,
    env: cleanEnv(),
    detached: true,
  })
  entry.process = proc

  // Emit initial status
  io.emit('command:output', {
    execution_id: executionId,
    content: `▸ Starting OCR ${baseCommand} workflow...\n`,
  })

  // 7. Parse NDJSON stream
  let lineBuffer = ''

  // Track active tool blocks — accumulate input JSON before emitting detail
  interface PendingTool { name: string; inputJson: string }
  const pendingTools = new Map<number, PendingTool>()
  let currentBlockIndex = -1

  function emitContent(content: string): void {
    entry.outputBuffer += content
    io.emit('command:output', { execution_id: executionId, content })
  }

  function flushPendingTool(blockIndex: number): void {
    const tool = pendingTools.get(blockIndex)
    if (!tool) return
    pendingTools.delete(blockIndex)

    let input: Record<string, unknown> = {}
    try { input = JSON.parse(tool.inputJson) } catch { /* partial JSON */ }
    const detail = formatToolDetail(tool.name, input)
    emitContent(`\n▸ ${detail}\n`)
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString()
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>
        handleNdjsonLine(parsed)
      } catch {
        // Non-JSON lines — emit as-is
        emitContent(line + '\n')
      }
    }
  })

  function handleNdjsonLine(parsed: Record<string, unknown>): void {
    const type = parsed['type'] as string | undefined

    if (type === 'stream_event') {
      const event = parsed['event'] as Record<string, unknown> | undefined
      if (!event) return
      const eventType = event['type'] as string | undefined
      const blockIndex = event['index'] as number | undefined

      // Text deltas — the actual response text
      if (eventType === 'content_block_delta') {
        const delta = event['delta'] as Record<string, unknown> | undefined
        const deltaType = delta?.['type'] as string | undefined

        if (deltaType === 'text_delta' && typeof delta?.['text'] === 'string') {
          emitContent(delta['text'] as string)
        }

        // Accumulate tool input JSON
        if (deltaType === 'input_json_delta' && typeof delta?.['partial_json'] === 'string') {
          const idx = blockIndex ?? currentBlockIndex
          const tool = pendingTools.get(idx)
          if (tool) {
            tool.inputJson += delta['partial_json'] as string
          }
        }
        // Skip thinking_delta — internal reasoning
      }

      // Tool use start — record the block, don't emit yet
      if (eventType === 'content_block_start') {
        const block = event['content_block'] as Record<string, unknown> | undefined
        if (block?.['type'] === 'tool_use') {
          const idx = blockIndex ?? ++currentBlockIndex
          currentBlockIndex = idx
          pendingTools.set(idx, {
            name: block['name'] as string,
            inputJson: '',
          })
        }
      }

      // Tool use complete — now we have the full input, emit the detail
      if (eventType === 'content_block_stop') {
        const idx = blockIndex ?? currentBlockIndex
        flushPendingTool(idx)
      }
    }

    // Complete assistant message — capture full text for DB
    if (type === 'assistant') {
      const fullText = extractAssistantText(parsed)
      if (fullText.length > 0) {
        entry.outputBuffer = fullText
      }
    }
  }

  // Capture stderr
  let stderrBuffer = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString()
  })

  proc.on('close', (code) => {
    // Clean up temp file
    try { unlinkSync(tmpFile) } catch { /* ignore */ }

    // Process remaining buffered data
    if (lineBuffer.trim()) {
      try {
        const parsed = JSON.parse(lineBuffer) as Record<string, unknown>
        handleNdjsonLine(parsed)
      } catch {
        // Skip
      }
    }

    // Append stderr if process failed
    if (code !== 0 && stderrBuffer) {
      const errContent = `\n\nError output:\n${stderrBuffer}`
      entry.outputBuffer += errContent
      io.emit('command:output', { execution_id: executionId, content: errContent })
    }

    finishExecution(io, db, ocrDir, executionId, code, entry.outputBuffer)
  })

  proc.on('error', (err) => {
    // Clean up temp file
    try { unlinkSync(tmpFile) } catch { /* ignore */ }

    const errContent = `Failed to spawn Claude: ${err.message}\n`
    entry.outputBuffer += errContent
    io.emit('command:output', { execution_id: executionId, content: errContent })
    finishExecution(io, db, ocrDir, executionId, -1, entry.outputBuffer)
  })
}

// ── Shared helpers ──

function finishExecution(
  io: SocketIOServer,
  db: Database,
  ocrDir: string,
  executionId: number,
  code: number | null,
  output: string
): void {
  const finishedAt = new Date().toISOString()

  db.run(
    `UPDATE command_executions
     SET exit_code = ?, finished_at = ?, output = ?
     WHERE id = ?`,
    [code, finishedAt, output, executionId]
  )
  saveDb(db, ocrDir)

  io.emit('command:finished', {
    execution_id: executionId,
    exitCode: code,
    finished_at: finishedAt,
  })

  activeCommands.delete(executionId)
}

/**
 * Format a tool_use block into a human-readable terminal line.
 */
function formatToolDetail(tool: string, input: Record<string, unknown>): string {
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

/**
 * Extract concatenated text from a complete assistant message.
 */
function extractAssistantText(parsed: Record<string, unknown>): string {
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
