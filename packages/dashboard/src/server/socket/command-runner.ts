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

import { spawnBinary, reapTree } from '@open-code-review/platform'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from '@open-code-review/persistence'
import type { SessionCaptureService } from '../services/capture/session-capture-service.js'
import {
  AiCliService,
  formatToolDetail,
  EventJournalAppender,
  type NormalizedEvent,
  type StreamEvent,
} from '../services/ai-cli/index.js'
import { FileTailer } from '../services/ai-cli/file-tailer.js'
import { resolveLocalCli } from './cli-resolver.js'
import { childEnv, childEnvFailureHint, formatChildEnvHeader } from '../child-env.js'
import {
  generateCommandUid,
  appendCommandLog,
} from '@open-code-review/persistence'
import { getWorkflowHardDeadlineMs } from '@open-code-review/config/runtime-config'
import {
  shellSplit,
  buildPrompt,
  extractPerInstanceModels,
} from './prompt-builder.js'
import {
  MAX_CONCURRENT,
  activeCommands,
  type ProcessEntry,
} from './process-registry.js'
import { writeSpawnMarker, clearSpawnMarker } from './spawn-markers.js'
import {
  WATCHDOG_TICK_MS,
  POST_RESULT_GRACE_MS,
  decideWatchdogTick,
  makeHeartbeatBumper,
} from './watchdog.js'
import { finishExecution } from './finalizer.js'

// Re-export the moved pure prompt helpers so existing import sites
// (`prompt-injection.test.ts`) keep resolving through command-runner; the
// canonical home is now `prompt-builder.ts`.
export { buildPrompt, escapeUserHeaders } from './prompt-builder.js'
// Re-export the registry accessors + marker cleanup the server lifecycle and
// HTTP routes consume, so the god-class split is internal-only.
export {
  isCommandRunning,
  getRunningCount,
  getActiveCommands,
  type ActiveCommandInfo,
} from './process-registry.js'
export { clearAllSpawnMarkers } from './spawn-markers.js'
// Re-export the watchdog decision surface (canonical home: `watchdog.ts`) so
// `watchdog-decision.test.ts` keeps importing through command-runner.
export {
  decideWatchdogTick,
  type WatchdogTickInput,
  type WatchdogTickDecision,
} from './watchdog.js'

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

/**
 * Registers the `command:run` socket handler for a connected client.
 */
export function registerCommandHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: Database,
  ocrDir: string,
  aiCliService: AiCliService,
  sessionCapture: SessionCaptureService,
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

      // Insert execution record. AI workflow commands (review, map, …)
      // participate in the agent-session journal — we set `vendor` and seed
      // `last_heartbeat_at` so the row appears in /api/agent-sessions and
      // is swept for liveness. Utility commands (state, progress, …) get
      // a vanilla command_executions row without the journal fields.
      const startedAt = new Date().toISOString()
      const uid = generateCommandUid()
      const argsJson = JSON.stringify(subArgs)
      const isAiCommand = AI_COMMANDS.has(baseCommand)
      const adapterBinary = isAiCommand ? aiCliService.getAdapter()?.binary ?? null : null
      db.run(
        `INSERT INTO command_executions
           (uid, command, args, started_at, vendor, last_heartbeat_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uid,
          command,
          argsJson,
          startedAt,
          adapterBinary,
          isAiCommand ? startedAt : null,
        ],
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
        spawnAiCommand(io, socket, db, ocrDir, executionId, baseCommand, subArgs, entry, aiCliService, sessionCapture)
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

      if (entry.detached && pid) {
        // Reap the WHOLE descendant tree (SIGTERM → grace → SIGKILL), robust to
        // children that escaped the process group via setsid() — e.g. a leaked
        // MCP daemon. A plain `kill(-pid)` would miss them.
        reapTree(pid)
      } else {
        // Non-detached utility commands: direct kill, escalate after a grace.
        proc.kill('SIGTERM')
        const killTimer = setTimeout(() => {
          if (activeCommands.has(targetId)) proc.kill('SIGKILL')
        }, 5000)
        proc.once('close', () => clearTimeout(killTimer))
      }
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
  const envResult = childEnv()
  const proc = localCli
    ? spawnBinary('node', [localCli, baseCommand, ...subArgs], {
        cwd: repoRoot,
        env: envResult.env,
      })
    : spawnBinary('ocr', [baseCommand, ...subArgs], {
        cwd: repoRoot,
        env: envResult.env,
      })
  entry.process = proc

  // Env provenance line, for parity with the adapter path's exec-log header
  // (names only) — a successful plain-CLI run records what was inherited,
  // not just the failure hint on a nonzero exit.
  const envHeader = `${formatChildEnvHeader(envResult)}\n`
  entry.outputBuffer += envHeader
  io.emit('command:output', { execution_id: executionId, content: envHeader })

  // Persist PID for orphan detection on restart
  if (proc.pid) {
    db.run(
      'UPDATE command_executions SET pid = ?, is_detached = 0 WHERE id = ?',
      [proc.pid, executionId],
    )
  }

  // UTF-8 boundary safety: `setEncoding` switches the stream to use
  // node's StringDecoder, which buffers incomplete UTF-8 sequences
  // across chunk boundaries instead of producing replacement chars.
  // Without this, when an OS pipe boundary lands mid-codepoint (common
  // for emoji and non-ASCII content), the trailing partial bytes
  // become `�` and any line containing the broken codepoint fails
  // `JSON.parse` in the line parsers and is silently dropped — losing
  // events including `session_id` captures. Round-1 Blocker 3 fix.
  proc.stdout?.setEncoding('utf-8')
  proc.stderr?.setEncoding('utf-8')

  proc.stdout?.on('data', (chunk: string) => {
    entry.outputBuffer += chunk
    io.emit('command:output', { execution_id: executionId, content: chunk })
  })

  proc.stderr?.on('data', (chunk: string) => {
    entry.outputBuffer += chunk
    io.emit('command:output', { execution_id: executionId, content: chunk })
  })

  proc.on('close', (code) => {
    // Env-posture diagnostic on failure — same surface contract as the AI
    // workflow path: removed names + snapshot age + remedy, names only.
    if (code !== 0) {
      const hint = `\n${childEnvFailureHint()}\n`
      entry.outputBuffer += hint
      io.emit('command:output', { execution_id: executionId, content: hint })
    }
    // `finishExecution` applies the cancel-wins preference centrally, so the
    // close handler need only translate a signal-kill (null code) to -1.
    finishExecution(io, db, ocrDir, executionId, code ?? -1, entry.outputBuffer)
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
  aiCliService: AiCliService,
  sessionCapture: SessionCaptureService,
): void {
  const adapter = aiCliService.getAdapter()
  if (!adapter) {
    const content = 'Error: No AI CLI adapter available\n'
    io.emit('command:output', { execution_id: executionId, content })
    finishExecution(io, db, ocrDir, executionId, 1, content)
    return
  }

  // Capability check: per-instance models in `--team` are silently
  // dropped on adapters that lack per-subagent model support. Surface
  // a structured warning so the user understands why their per-instance
  // `model: ...` settings appear ignored. The archived
  // `add-agent-sessions-and-team-models` change defines this contract;
  // without this consumer, the contract was unwired.
  //
  // The warning text is computed here (adapter + subArgs are in scope) but
  // EMITTED later — once `emitStreamEvent`/the JSONL journal are set up — so
  // it lands in the per-execution journal as a typed `notice` event and not
  // only on the ephemeral `command:output` text stream (round-1 S10).
  let capabilityWarning: string | null = null
  if (adapter.supportsPerTaskModel === false) {
    const perInstanceModels = extractPerInstanceModels(subArgs)
    if (perInstanceModels.length > 0) {
      capabilityWarning =
        `[ocr] Warning: ${adapter.name} does not support per-subagent model overrides. ` +
        `The configured per-instance models (${perInstanceModels.join(', ')}) ` +
        `will be ignored — all reviewers will run on the parent process model.`
    }
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

  // 2. Build the prompt. Pure helper — extracted so the structural
  // ordering of trusted-vs-untrusted content is testable in isolation
  // (round-3 SF1).
  const localCli = resolveLocalCli()
  const built = buildPrompt({
    baseCommand,
    subArgs,
    commandContent,
    executionUid: entry.uid,
    localCli,
  })
  const prompt = built.prompt
  const resumeWorkflowId = built.resumeWorkflowId

  // 4. Resolve resume token (if --resume <workflow-id> was supplied).
  //
  // Routes through `sessionCapture.resolveResumeContext` so the in-process
  // `--resume` path honors the same JSONL-recovery + host-binary-missing
  // semantics as the dashboard's terminal-handoff panel. Calling
  // `getLatestAgentSessionWithVendorId` directly here would skip recovery
  // and let the runner spawn against a missing vendor binary — round-2
  // Blocker 2.
  let resumeSessionId: string | undefined
  if (resumeWorkflowId) {
    try {
      const outcome = sessionCapture.resolveResumeContext(resumeWorkflowId)
      if (outcome.kind === 'resumable') {
        resumeSessionId = outcome.vendorSessionId
        io.emit('command:output', {
          execution_id: executionId,
          content: `▸ Resuming workflow ${resumeWorkflowId} via captured vendor session id\n`,
        })
      } else {
        const { headline, cause, remediation } = outcome.diagnostics.microcopy
        io.emit('command:output', {
          execution_id: executionId,
          content:
            `⚠ Cannot resume workflow ${resumeWorkflowId}: ${headline}\n` +
            `  Cause: ${cause}\n` +
            `  Fix:   ${remediation}\n` +
            `  Starting a fresh conversation.\n`,
        })
      }
    } catch (err) {
      console.error('Failed to resolve resume context:', err)
    }
  }

  // 5a. Spawn via adapter.
  //
  // We pass our own command_executions.uid through as
  // `OCR_DASHBOARD_EXECUTION_UID` so the AI's child `ocr state begin` call
  // can link the new session row's id back to this row by setting
  // `workflow_id`. Without that linkage the handoff route can't resolve
  // the captured `vendor_session_id` for resume because it queries by
  // `workflow_id`.
  const repoRoot = dirname(ocrDir)
  // Per-execution log file for file-stdio (the root-cause wedge fix). The
  // adapter redirects the detached agent's stdout+stderr here instead of OS
  // pipes, and we tail it below — so a leaked grandchild can never hold a pipe
  // whose EOF blocks finalization.
  //
  // Pipe fallback is a SUPPORTED DEGRADED MODE, by decision (round-2 S7):
  // failing the spawn because a log dir couldn't be created would trade a
  // weaker-but-correct run for no run at all. Degraded means only that `close`
  // can again be withheld by a leaked grandchild — finalization still cannot
  // hang: the watchdog's result-grace and hard-deadline branches finalize
  // regardless of stdio mode (round-2 SF1), so the fallback differs in
  // promptness, never in outcome.
  let logFile: string | undefined
  if (entry.uid) {
    try {
      const logDir = join(ocrDir, 'data', 'exec-logs')
      mkdirSync(logDir, { recursive: true })
      logFile = join(logDir, `${entry.uid}.log`)
    } catch (err) {
      console.error(
        '[command-runner] could not prepare exec-log dir — falling back to pipe stdio (degraded: close may be withheld by a leaked grandchild; watchdog deadlines still finalize):',
        err,
      )
    }
  }
  const spawnOpts: {
    mode: 'workflow'
    prompt: string
    cwd: string
    resumeSessionId?: string
    env?: Record<string, string>
    logFile?: string
  } = {
    mode: 'workflow',
    prompt,
    cwd: repoRoot,
    env: { OCR_DASHBOARD_EXECUTION_UID: entry.uid },
  }
  if (resumeSessionId) {
    spawnOpts.resumeSessionId = resumeSessionId
  }
  if (logFile) {
    spawnOpts.logFile = logFile
  }
  const { process: proc, detached, logPath } = adapter.spawn(spawnOpts)
  entry.process = proc
  entry.detached = detached

  // Persist PID for orphan detection on restart
  if (proc.pid) {
    db.run(
      'UPDATE command_executions SET pid = ?, is_detached = ? WHERE id = ?',
      [proc.pid, detached ? 1 : 0, executionId],
    )
  }

  // Durable spawn marker. Written to disk synchronously BEFORE the AI
  // can issue its first `ocr state begin` call. The CLI's state begin
  // reads this marker to bind `workflow_id` on the dashboard's parent
  // execution row.
  //
  // Why this is durable in a way the previous attempts weren't:
  //   • OCR_DASHBOARD_EXECUTION_UID env var → can be stripped by
  //     sandboxed shells (Claude Code's Bash tool sometimes drops it).
  //   • --dashboard-uid prompt instruction → relies on the AI reading
  //     and following the instruction.
  //   • DbSyncWatcher.onSessionInserted hook → fires only on session
  //     INSERT, misses the same-id UPDATE path.
  //   • Post-spawn polling → time-bounded, races with crash windows.
  //   • Timing-derivation in the read query → brittle when concurrent
  //     reviews run in the same project.
  //
  // The marker file is filesystem-level state that both processes
  // can read deterministically. State init looks for it on every
  // invocation; the link is guaranteed at the moment the workflow
  // becomes known.
  if (entry.uid && proc.pid) {
    try {
      writeSpawnMarker(ocrDir, entry.uid, proc.pid)
    } catch (err) {
      console.error('[command-runner] writeSpawnMarker failed:', err)
    }
  }

  // Auxiliary post-spawn polling — secondary defense for cases where
  // the marker is consumed but the link doesn't take (e.g. session
  // row not yet visible in memory when state begin runs). Polls every
  // 2s for up to 5 min; stops as soon as the link is bound or the
  // process finishes. With the marker in place this is rarely needed,
  // but it costs almost nothing and closes any remaining race window.
  const POLL_INTERVAL_MS = 2_000
  const POLL_TIMEOUT_MS = 5 * 60_000
  const pollDeadline = Date.now() + POLL_TIMEOUT_MS
  const linkPoll = setInterval(() => {
    if (Date.now() > pollDeadline) {
      clearInterval(linkPoll)
      return
    }
    if (!entry.uid) {
      clearInterval(linkPoll)
      return
    }
    try {
      const linked = sessionCapture.linkExecutionToActiveSession(entry.uid)
      if (linked) clearInterval(linkPoll)
    } catch (err) {
      console.error('[command-runner] link-poll error:', err)
    }
  }, POLL_INTERVAL_MS)
  // Stash on the entry so process-close handlers can clear it.
  entry.linkPoll = linkPoll

  // ── Liveness heartbeat + supervisor watchdog ──
  // The parent execution row's heartbeat was previously seeded once at spawn
  // and never bumped, so every long review drifted to "stalled". Bump it on
  // output activity (throttled), and let the watchdog keep it fresh during
  // long silent stretches and reap a wedged-but-alive process. The throttled
  // writer itself lives in `watchdog.ts` (round-1 S19).
  const bumpHeartbeat = makeHeartbeatBumper(db, executionId, entry)
  const hardDeadlineMs = getWorkflowHardDeadlineMs(ocrDir)
  entry.watchdog = setInterval(() => {
    if (entry.finalized) return
    const child = entry.process
    const pid = child?.pid
    if (!child || !pid) return
    // Positive exit evidence from OUR child's handle. Gates the SIGNAL only —
    // finalization runs regardless of liveness (round-2 SF1); see
    // decideWatchdogTick for the full invariant set.
    const exited = child.exitCode !== null || child.signalCode !== null
    const decision = decideWatchdogTick({
      exited,
      resultSeenAt: entry.resultSeenAt,
      resultIsError: entry.resultIsError,
      startedAtMs: Date.parse(entry.startedAt),
      nowMs: Date.now(),
      postResultGraceMs: POST_RESULT_GRACE_MS,
      hardDeadlineMs,
    })
    switch (decision.action) {
      case 'beat':
        // Healthy live child: keep the heartbeat fresh through silent stretches.
        bumpHeartbeat()
        return
      case 'wait':
        // Exited child, no deadline tripped: do NOT bump — a no-result dead
        // child must stay claimable by the liveness sweep's orphan backstop.
        return
      case 'finalize': {
        if (decision.reason === 'hard-deadline') {
          const minutes = Math.round(hardDeadlineMs / 60000)
          console.warn(`[watchdog] execution ${executionId}: exceeded hard deadline (${minutes}m) — finalizing${decision.reap ? ' + reaping tree' : ''}`)
          // Persist the remediation breadcrumb: append to the buffer BEFORE
          // finalizing so the -5 row (and its JSONL backup) carries it — the
          // live socket emit alone vanishes from history (round-2 SF4).
          const notice =
            `\n[watchdog] Reaped after exceeding the ${minutes}-minute hard deadline. ` +
            `Raise runtime.workflow_hard_deadline_minutes in .ocr/config.yaml for large reviewer fleets.\n`
          entry.outputBuffer += notice
          io.emit('command:output', { execution_id: executionId, content: notice })
          // Mirror as a typed `notice` event so the deadline breadcrumb is in
          // the JSONL journal / timeline, not only the text buffer (round-1 S10,
          // task 10.4). emitStreamEvent + journal are initialized synchronously
          // during setup, long before this async watchdog tick can fire.
          emitStreamEvent({
            type: 'notice',
            level: 'warning',
            code: 'hard_deadline_reaped',
            message: notice.trim(),
          })
        } else {
          console.warn(`[watchdog] execution ${executionId}: result seen but no close after grace — finalizing${decision.reap ? ' + reaping tree' : ''}`)
        }
        if (decision.reap) reapTree(pid)
        finishExecution(io, db, ocrDir, executionId, decision.exitCode, entry.outputBuffer)
        return
      }
      default: {
        // Exhaustive-switch guard: a new WatchdogTickDecision action surfaces
        // here at compile time rather than silently falling through at runtime.
        const _exhaustive: never = decision
        throw new Error(`unhandled watchdog action: ${JSON.stringify(_exhaustive)}`)
      }
    }
  }, WATCHDOG_TICK_MS)
  entry.watchdog.unref()

  // Emit initial status
  io.emit('command:output', {
    execution_id: executionId,
    content: `▸ Starting OCR ${baseCommand} workflow...\n`,
  })

  // 5b. Parse structured output via adapter.
  //
  // Two parallel surfaces are populated:
  //   1. The legacy `command:output` text stream + entry.outputBuffer —
  //      keeps the existing rendering working until the timeline UI lands.
  //   2. The new `command:event` typed stream + events JSONL on disk —
  //      the foundation for the live-timeline renderer (Phase 3) and
  //      for history replay (Phase 4).
  //
  // Both are intentionally driven by the same set of NormalizedEvents.
  // If anything fails on the journal/event side, the legacy surface
  // continues to work — we never let observability concerns crash a run.
  const parser = adapter.createParser()
  let lineBuffer = ''
  let eventSeq = 0
  const journal = new EventJournalAppender(ocrDir, executionId)

  function emitContent(content: string): void {
    entry.outputBuffer += content
    io.emit('command:output', { execution_id: executionId, content })
  }

  /**
   * Wrap a NormalizedEvent with execution context and:
   *   1. append it to the per-execution JSONL journal
   *   2. emit it on the typed `command:event` socket channel
   *
   * `agentId` is `'orchestrator'` for now — sub-agent ids will be layered
   * in by a future phase that joins the command_executions table (which
   * the AI's `ocr session start-instance` calls populate) into the feed.
   */
  function emitStreamEvent(evt: NormalizedEvent): void {
    const stream: StreamEvent = {
      ...evt,
      executionId,
      agentId: 'orchestrator',
      timestamp: new Date().toISOString(),
      seq: ++eventSeq,
    }
    journal.append(stream)
    io.emit('command:event', stream)
  }

  // Now that the journal + typed-event stream are live, flush the deferred
  // capability warning (computed during setup, above) as a typed `notice`
  // event so it is durably journaled and replayable — mirrored to the legacy
  // text stream so the current text view still shows it (round-1 S10).
  if (capabilityWarning) {
    emitContent(`${capabilityWarning}\n`)
    emitStreamEvent({
      type: 'notice',
      level: 'warning',
      code: 'per_instance_model_unsupported',
      message: capabilityWarning,
    })
  }

  function handleEvent(evt: NormalizedEvent): void {
    switch (evt.type) {
      case 'text_delta':
        emitContent(evt.text)
        emitStreamEvent(evt)
        break
      case 'thinking_delta':
        // Legacy view doesn't surface thinking — keep it that way to
        // preserve existing UX. Renderer will pick it up via the typed
        // stream.
        emitStreamEvent(evt)
        break
      case 'tool_call': {
        const detail = formatToolDetail(evt.name, evt.input)
        emitContent(`\n▸ ${detail}\n`)
        emitStreamEvent(evt)
        break
      }
      case 'tool_input_delta':
        // Streaming input chars — only the typed stream cares.
        emitStreamEvent(evt)
        break
      case 'tool_result':
        // Result body is surfaced through the typed stream (renderer
        // shows it in the expanded tool block). Legacy view doesn't
        // render tool results inline.
        emitStreamEvent(evt)
        break
      case 'message':
        // Replace the legacy buffer with the canonical assistant text —
        // matches the previous `full_text` semantic.
        entry.outputBuffer = evt.text
        emitStreamEvent(evt)
        break
      case 'error': {
        const errLine = `\n[error] ${evt.message}\n`
        emitContent(errLine)
        emitStreamEvent(evt)
        break
      }
      case 'session_id': {
        // Capture flows through the SessionCaptureService — single owner
        // for vendor_session_id writes per the
        // add-self-diagnosing-resume-handoff proposal. The service is
        // idempotent (COALESCE) so repeated session_id events from the
        // vendor stream are safe.
        sessionCapture.recordSessionId(executionId, evt.id)
        emitStreamEvent(evt)
        break
      }
      case 'result': {
        // The agent's turn loop is done. Record it for the watchdog: a healthy
        // process exits within a moment (the `close` handler finalizes
        // normally); a wedged one (leaked grandchild holding the pipe) is reaped
        // by the watchdog after POST_RESULT_GRACE_MS so finalization never hangs
        // on stdio EOF.
        entry.resultSeenAt = Date.now()
        entry.resultIsError = evt.isError
        emitStreamEvent(evt)
        break
      }
    }
  }

  // The single sink for output chunks, fed by EITHER the file tailer (file-stdio
  // workflows) or the stdout pipe (fallback). Identical logic in both cases so
  // the proven line-buffer + parseLine loop never forks.
  function onOutputChunk(chunk: string): void {
    // Output activity is the most truthful liveness signal — the agent is
    // producing tokens. Bump the parent row's heartbeat (throttled) so a long
    // review no longer drifts to "stalled".
    bumpHeartbeat()
    lineBuffer += chunk
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      const events = parser.parseLine(line)
      if (events.length === 0) {
        // Line wasn't parseable as a structured event — surface it raw on
        // the legacy channel so power-user output (warnings printed by
        // the AI CLI itself) still shows up. Don't put it on the typed
        // stream.
        emitContent(line + '\n')
        continue
      }
      for (const evt of events) {
        handleEvent(evt)
      }
    }
  }

  let stderrBuffer = ''
  if (logPath) {
    // File-stdio: stdout+stderr are interleaved in the log file (no parent-held
    // pipe). Tail the file for the live stream. The decoder inside FileTailer
    // preserves multi-byte UTF-8 boundaries — the role setEncoding played for
    // the pipe. stderr diagnostics ride the same path and surface inline via the
    // unparseable-line fallback above.
    const tailer = new FileTailer(logPath, onOutputChunk)
    tailer.start()
    entry.tailer = tailer
  } else {
    // Pipe fallback (non-detached / no log file). UTF-8 boundary safety — see
    // Blocker 3. Without `setEncoding`, a multi-byte codepoint straddling a pipe
    // boundary yields `�`, breaking JSON.parse on any vendor line carrying
    // emoji/non-ASCII — including a line that may carry `session_id` for capture.
    proc.stdout?.setEncoding('utf-8')
    proc.stderr?.setEncoding('utf-8')
    proc.stdout?.on('data', onOutputChunk)
    // Capture stderr separately so a non-zero exit can append it as a verdict.
    proc.stderr?.on('data', (chunk: string) => {
      stderrBuffer += chunk
    })
  }

  proc.on('close', (code) => {
    // Stop the workflow-id auto-link polling — the process is done,
    // the link either happened or it didn't, no point continuing to
    // poll the DB.
    if (entry.linkPoll) {
      clearInterval(entry.linkPoll)
      entry.linkPoll = undefined
    }
    // Remove this execution's spawn marker so the next `ocr state begin`
    // (likely from a CLI-only invocation outside the dashboard) doesn't
    // mistakenly link to this finished execution. Per-execution so a
    // concurrent review's still-live marker is left intact (round-1 S25).
    clearSpawnMarker(ocrDir, entry.uid)

    // File-stdio: final synchronous drain of the log tail before we process the
    // remaining buffer, so bytes the agent wrote just before exiting (between
    // the last poll and exit) are not lost.
    if (entry.tailer) {
      entry.tailer.stop()
      entry.tailer = undefined
    }

    // Process remaining buffered data
    if (lineBuffer.trim()) {
      const events = parser.parseLine(lineBuffer)
      for (const evt of events) {
        handleEvent(evt)
      }
    }

    // Append stderr if process failed — emit as a structured error event
    // too so timeline renderers can render it inline rather than the
    // legacy raw-text appendix.
    if (code !== 0 && stderrBuffer) {
      const errContent = `\n\nError output:\n${stderrBuffer}`
      entry.outputBuffer += errContent
      io.emit('command:output', { execution_id: executionId, content: errContent })
      emitStreamEvent({
        type: 'error',
        source: 'process',
        message: 'Process exited with non-zero code',
        detail: stderrBuffer.trim(),
      })
    }

    // Env-posture diagnostic on any failure: a "works in my shell, fails in
    // dashboard" report must be resolvable from this surface alone (removed
    // names + snapshot age + restart remedy — names only, never values).
    if (code !== 0) {
      const hint = `\n${childEnvFailureHint()}\n`
      entry.outputBuffer += hint
      io.emit('command:output', { execution_id: executionId, content: hint })
    }

    // Best-effort flush of the events JSONL. The promise is intentionally
    // not awaited (the close path is synchronous from the caller's view),
    // but we attach a catch so an OS-level write failure can't surface as
    // an unhandled rejection that would crash the dashboard process.
    journal.close().catch((err) => {
      console.error('[event-journal] close failed:', err)
    })
    // Cancel-wins is applied centrally in `finishExecution`; here we only map a
    // signal-kill (null code) to -1.
    finishExecution(io, db, ocrDir, executionId, code ?? -1, entry.outputBuffer)
  })

  proc.on('error', (err) => {
    // Stop the workflow-id auto-link polling — the spawn failed, the
    // entry will be removed from `activeCommands` shortly, and a
    // dangling timer would keep hammering the DB every 2s for up to
    // 5 minutes (and could mis-bind a subsequent execution). Round-1
    // Should Fix #9.
    if (entry.linkPoll) {
      clearInterval(entry.linkPoll)
      entry.linkPoll = undefined
    }
    const errContent = `Failed to spawn AI CLI: ${err.message}\n`
    entry.outputBuffer += errContent
    io.emit('command:output', { execution_id: executionId, content: errContent })
    finishExecution(io, db, ocrDir, executionId, -1, entry.outputBuffer)
  })
}
