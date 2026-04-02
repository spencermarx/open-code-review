/**
 * Socket.IO command execution handler.
 *
 * Spawns CLI commands as child processes, streams output via socket events,
 * and logs execution to the command_executions table.
 *
 * Supports two command types:
 * - Utility commands (progress, state): spawned via the local OCR CLI
 * - AI workflow commands (map, review): spawned via the AI CLI adapter strategy
 */

import { type ChildProcess } from 'node:child_process'
import { spawnBinary } from '@open-code-review/platform'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from 'sql.js'
import { saveDb } from '../db.js'
import { AiCliService, formatToolDetail, type NormalizedEvent } from '../services/ai-cli/index.js'
import { resolveLocalCli } from './cli-resolver.js'
import { cleanEnv } from './env.js'
import {
  generateCommandUid,
  appendCommandLog,
  type CommandLogEntry,
} from '@open-code-review/cli/db'

/** Split a command string into tokens, respecting single and double quotes. */
function shellSplit(str: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

// ── Types ──

type CommandRunPayload = {
  command: string
  args?: string[]
}

type CommandStartedEvent = {
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

/** AI workflow commands — spawned via the AI CLI adapter strategy. */
const AI_COMMANDS = new Set(['map', 'review', 'translate-review-to-single-human', 'address', 'create-reviewer', 'sync-reviewers'])

// ── State ──

const MAX_CONCURRENT = 3

type ProcessEntry = {
  process: ChildProcess | null
  executionId: number
  uid: string
  argsJson: string
  outputBuffer: string
  commandStr: string
  startedAt: string
  /** Whether the process was spawned with detached: true (supports process group kill). */
  detached: boolean
  /** Set to true by the cancel handler so the close handler can use exit code -2. */
  cancelled: boolean
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

export type ActiveCommandInfo = {
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
  ocrDir: string,
  aiCliService: AiCliService
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
      const parts = shellSplit(normalized)
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

      // Guard AI commands — require an available AI CLI
      if (AI_COMMANDS.has(baseCommand) && !aiCliService.isAvailable()) {
        socket.emit('command:error', {
          error: 'No AI CLI available. Install Claude Code or OpenCode to run AI commands from the dashboard.',
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
      const uid = generateCommandUid()
      const argsJson = JSON.stringify(subArgs)
      db.run(
        `INSERT INTO command_executions (uid, command, args, started_at)
         VALUES (?, ?, ?, ?)`,
        [uid, command, argsJson, startedAt]
      )
      const idResult = db.exec('SELECT last_insert_rowid() as id')
      const executionId = (idResult[0]?.values[0]?.[0] as number) ?? 0

      // Best-effort JSONL backup
      appendCommandLog(ocrDir, {
        v: 1,
        uid,
        db_id: executionId,
        command,
        args: argsJson,
        exit_code: null,
        started_at: startedAt,
        finished_at: null,
        is_detached: AI_COMMANDS.has(baseCommand) ? 1 : 0,
        event: 'start',
        writer: 'dashboard',
      })

      const isAi = AI_COMMANDS.has(baseCommand)
      const entry: ProcessEntry = {
        process: null,
        executionId,
        uid,
        argsJson,
        outputBuffer: '',
        commandStr: command,
        startedAt,
        detached: isAi,
        cancelled: false,
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
        spawnAiCommand(io, socket, db, ocrDir, executionId, baseCommand, subArgs, entry, aiCliService)
      } else {
        spawnCliCommand(io, db, ocrDir, executionId, baseCommand, subArgs, entry)
      }
    } catch (err) {
      console.error('Error in command:run handler:', err)
      socket.emit('error', { message: 'Internal error' })
    }
  })

  // Allow cancelling a running command by execution_id.
  // Kill the entire process group and escalate to SIGKILL if the process
  // doesn't exit within 5 seconds.
  socket.on('command:cancel', (payload?: { execution_id?: number }) => {
    try {
      const targetId = payload?.execution_id
      if (!targetId) return

      const entry = activeCommands.get(targetId)
      if (!entry) return

      entry.cancelled = true

      const proc = entry.process
      if (!proc) return  // Process not yet spawned
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
  const repoRoot = dirname(ocrDir)
  const proc = localCli
    ? spawnBinary('node', [localCli, baseCommand, ...subArgs], {
        cwd: repoRoot,
        env: cleanEnv(),
      })
    : spawnBinary('ocr', [baseCommand, ...subArgs], {
        cwd: repoRoot,
        env: cleanEnv(),
      })
  entry.process = proc

  // Persist PID for orphan detection on restart
  if (proc.pid) {
    db.run(
      'UPDATE command_executions SET pid = ?, is_detached = 0 WHERE id = ?',
      [proc.pid, executionId],
    )
  }

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
    const finalCode = code ?? (entry.cancelled ? -2 : -1)
    finishExecution(io, db, ocrDir, executionId, finalCode, entry.outputBuffer)
  })

  proc.on('error', (err) => {
    entry.outputBuffer += `Process error: ${err.message}`
    finishExecution(io, db, ocrDir, executionId, -1, entry.outputBuffer)
  })
}

// ── AI workflow command spawn (adapter strategy) ──

function spawnAiCommand(
  io: SocketIOServer,
  _socket: Socket,
  db: Database,
  ocrDir: string,
  executionId: number,
  baseCommand: string,
  subArgs: string[],
  entry: ProcessEntry,
  aiCliService: AiCliService
): void {
  const adapter = aiCliService.getAdapter()
  if (!adapter) {
    const content = 'Error: No AI CLI adapter available\n'
    io.emit('command:output', { execution_id: executionId, content })
    finishExecution(io, db, ocrDir, executionId, 1, content)
    return
  }

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

  // 2. Parse subArgs — command-specific
  const promptLines: string[] = []

  if (baseCommand === 'create-reviewer' || baseCommand === 'sync-reviewers') {
    // Pass raw args through to the AI prompt (name, --focus, etc.)
    const argsStr = subArgs.length > 0 ? subArgs.join(' ') : ''
    promptLines.push(
      `Follow the instructions below to run the OCR ${baseCommand} workflow.`,
      '',
      `Arguments: ${argsStr || 'none'}`,
    )
  } else {
    // Review/map arg parsing: target, --fresh, --requirements, --team, --reviewer
    let target = 'staged changes'
    let requirements = ''
    let team = ''
    const reviewerDescriptions: { description: string; count: number }[] = []
    const options: string[] = []
    let i = 0
    while (i < subArgs.length) {
      const arg = subArgs[i] ?? ''
      if (arg === '--fresh') {
        options.push('--fresh')
        i++
      } else if (arg === '--requirements' && i + 1 < subArgs.length) {
        requirements = subArgs.slice(i + 1).join(' ')
        break
      } else if (arg === '--team' && i + 1 < subArgs.length) {
        team = subArgs[i + 1] ?? ''
        i += 2
      } else if (arg === '--reviewer' && i + 1 < subArgs.length) {
        const raw = subArgs[i + 1] ?? ''
        // Support count prefix format: 2:"description"
        const countMatch = raw.match(/^(\d+):(.+)$/)
        if (countMatch) {
          reviewerDescriptions.push({ description: countMatch[2]!, count: parseInt(countMatch[1]!, 10) })
        } else {
          reviewerDescriptions.push({ description: raw, count: 1 })
        }
        i += 2
      } else if (!arg.startsWith('--')) {
        target = arg
        i++
      } else {
        i++
      }
    }

    const optionsStr = options.length > 0 ? options.join(' ') : 'none'
    promptLines.push(
      `Follow the instructions below to run the OCR ${baseCommand} workflow.`,
      '',
      `Target: ${target}`,
      `Options: ${optionsStr}`,
    )
    if (team) {
      promptLines.push(`Team: ${team}`)
    }
    for (const { description, count } of reviewerDescriptions) {
      if (count > 1) {
        promptLines.push(`Reviewer (x${count}): ${description}`)
      } else {
        promptLines.push(`Reviewer: ${description}`)
      }
    }
    if (requirements) {
      promptLines.push(`Requirements: ${requirements}`)
    }
  }

  // Resolve the local CLI so the spawned AI uses the correct version.
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

  // 4. Spawn via adapter
  const repoRoot = dirname(ocrDir)
  const { process: proc, detached } = adapter.spawn({ mode: 'workflow', prompt, cwd: repoRoot })
  entry.process = proc
  entry.detached = detached

  // Persist PID for orphan detection on restart
  if (proc.pid) {
    db.run(
      'UPDATE command_executions SET pid = ?, is_detached = ? WHERE id = ?',
      [proc.pid, detached ? 1 : 0, executionId],
    )
  }

  // Emit initial status
  io.emit('command:output', {
    execution_id: executionId,
    content: `▸ Starting OCR ${baseCommand} workflow...\n`,
  })

  // 5. Parse structured output via adapter
  let lineBuffer = ''

  type PendingTool = { name: string; inputJson: string }
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
      const events = adapter.parseLine(line)
      if (events.length === 0 && line.trim()) {
        emitContent(line + '\n')
        continue
      }
      for (const evt of events) {
        switch (evt.type) {
          case 'text':
            emitContent(evt.text)
            break
          case 'tool_start':
            if (evt.name === '__input_json_delta') {
              const idx = (evt.input['blockIndex'] as number) ?? currentBlockIndex
              const tool = pendingTools.get(idx)
              if (tool) tool.inputJson += evt.input['partial_json'] as string
            } else {
              const idx = ++currentBlockIndex
              pendingTools.set(idx, { name: evt.name, inputJson: '' })
            }
            break
          case 'tool_end':
            flushPendingTool(evt.blockIndex >= 0 ? evt.blockIndex : currentBlockIndex)
            break
          case 'full_text':
            entry.outputBuffer = evt.text
            break
        }
      }
    }
  })

  // Capture stderr
  let stderrBuffer = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString()
  })

  proc.on('close', (code) => {
    // Process remaining buffered data
    if (lineBuffer.trim()) {
      const events = adapter.parseLine(lineBuffer)
      for (const evt of events) {
        switch (evt.type) {
          case 'text':
            emitContent(evt.text)
            break
          case 'tool_end':
            flushPendingTool(evt.blockIndex >= 0 ? evt.blockIndex : currentBlockIndex)
            break
          case 'full_text':
            entry.outputBuffer = evt.text
            break
        }
      }
    }

    // Append stderr if process failed
    if (code !== 0 && stderrBuffer) {
      const errContent = `\n\nError output:\n${stderrBuffer}`
      entry.outputBuffer += errContent
      io.emit('command:output', { execution_id: executionId, content: errContent })
    }

    const finalCode = code ?? (entry.cancelled ? -2 : -1)
    finishExecution(io, db, ocrDir, executionId, finalCode, entry.outputBuffer)
  })

  proc.on('error', (err) => {
    const errContent = `Failed to spawn AI CLI: ${err.message}\n`
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
  const entry = activeCommands.get(executionId)

  db.run(
    `UPDATE command_executions
     SET exit_code = ?, finished_at = ?, output = ?, pid = NULL
     WHERE id = ?`,
    [code, finishedAt, output, executionId]
  )
  saveDb(db, ocrDir)

  // Best-effort JSONL backup
  if (entry?.uid) {
    appendCommandLog(ocrDir, {
      v: 1,
      uid: entry.uid,
      db_id: executionId,
      command: entry.commandStr,
      args: entry.argsJson ?? null,
      exit_code: code,
      started_at: entry.startedAt,
      finished_at: finishedAt,
      is_detached: entry.detached ? 1 : 0,
      event: code === -2 ? 'cancel' : 'finish',
      writer: 'dashboard',
    })
  }

  io.emit('command:finished', {
    execution_id: executionId,
    exitCode: code,
    finished_at: finishedAt,
  })

  activeCommands.delete(executionId)
}
