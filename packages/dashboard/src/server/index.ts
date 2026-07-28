/**
 * Dashboard server entry point.
 *
 * Express + Socket.IO server that serves the dashboard API
 * and static client files in production.
 */

import express from 'express'
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { reapTree, isProcessAlive, execBinary, spawnBinary } from '@open-code-review/platform'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { Server as SocketIOServer } from 'socket.io'

import { resolveOcrDir } from './services/ocr-resolver.js'
import { openDb, closeDb, getAllRounds, getReviewerOutputsForRound, getRoundProgress } from './db.js'
import { registerSocketHandlers } from './socket/handlers.js'
import { createSessionsRouter } from './routes/sessions.js'
import { createReviewsRouter } from './routes/reviews.js'
import { createMapsRouter } from './routes/maps.js'
import { createArtifactsRouter } from './routes/artifacts.js'
import { createProgressRouter } from './routes/progress.js'
import { createNotesRouter } from './routes/notes.js'
import { createStatsRouter } from './routes/stats.js'
import { createCommandsRouter } from './routes/commands.js'
import { createConfigRouter } from './routes/config.js'
import { createChatRouter } from './routes/chat.js'
import { createReviewersRouter, watchReviewersMeta } from './routes/reviewers.js'
import { createAgentSessionsRouter } from './routes/agent-sessions.js'
import { createHandoffRouter } from './routes/handoff.js'
import { createTeamRouter } from './routes/team.js'
import { AiCliService } from './services/ai-cli/index.js'
import { createSessionCaptureService } from './services/capture/session-capture-service.js'
import { FilesystemSync } from './services/filesystem-sync.js'
import { DbSyncWatcher } from './services/db-sync-watcher.js'
import { registerCommandHandlers, clearAllSpawnMarkers } from './socket/command-runner.js'
import { registerChatHandlers, cleanupAllChats } from './socket/chat-handler.js'
import { registerPostHandlers, cleanupAllPostGenerations } from './socket/post-handler.js'
import {
  replayCommandLog,
  sweepStaleAgentSessions,
  sweepStaleSessions,
  walCheckpointTruncate,
  reapOrphanDbFiles,
  reapStaleExecLogs,
  defaultIsAlive,
  PID_REUSE_GUARD_MS,
  sqliteUtcMs,
  CANCELLED_EXIT_CODE,
} from '@open-code-review/persistence'
import {
  getAgentHeartbeatSeconds,
  getForwardResumeMaxAttempts,
} from '@open-code-review/config/runtime-config'
import { readDashboardConfig } from '@open-code-review/config/dashboard-config'
import {
  captureChildEnvBase,
  childEnv,
  getChildEnvBase,
  initChildEnvBase,
  type ChildEnvBase,
} from './child-env.js'
import { runForwardResumeSweep } from './services/forward-resume-sweep.js'
import { makeSpawnResume } from './services/forward-resume-spawn.js'
import { reconcileCompletedSessions } from '@open-code-review/persistence/state'

import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Shorten an absolute path for display (replace homedir with ~). */
function shortenPath(p: string): string {
  const home = homedir()
  return p.startsWith(home) ? '~' + p.slice(home.length) : p
}

/** Match any localhost origin (any port) for dev CORS. Accepts `localhost` and `127.0.0.1`. */
function isLocalhostOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

// ── Bearer token authentication ──
// Generate a cryptographically random token at startup.
// All API and Socket.IO requests must present this token.
const AUTH_TOKEN = randomBytes(32).toString('hex')

const app = express()
const httpServer = createServer(app)

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NODE_ENV !== 'production'
      // Allow any localhost origin (dynamic ports) and no-origin requests
      // (curl, Postman, CLI socket clients). Bearer token is the real gate.
      ? (origin, cb) => cb(null, !origin || isLocalhostOrigin(origin))
      : false,
  },
  maxHttpBufferSize: 1e6, // 1 MB — explicit default; review if large payloads are needed
})

// ── Middleware ──

app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use((_req, res, next) => {
    const origin = _req.headers.origin
    if (origin && isLocalhostOrigin(origin)) {
      res.header('Access-Control-Allow-Origin', origin)
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })
}

// ── Health check (available without auth, before DB init) ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// ── Bearer token middleware for /api/* routes ──
app.use('/api', (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized: invalid or missing bearer token' })
    return
  }
  next()
})

// ── Socket.IO authentication middleware ──
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token || token !== AUTH_TOKEN) {
    next(new Error('Unauthorized: invalid or missing bearer token'))
    return
  }
  next()
})

// ── Dev-only token bootstrap endpoint ──
// In development, the Vite dev server serves index.html (not Express),
// so the client cannot receive the token via HTML injection. This endpoint
// allows the Vite-served client to fetch the token on startup.
// In production, the token is injected into index.html as a <script> tag.
if (process.env.NODE_ENV !== 'production') {
  app.get('/auth/token', (req, res) => {
    const origin = req.headers.origin
    if (origin && !isLocalhostOrigin(origin)) {
      res.status(403).json({ error: 'Forbidden: invalid origin' })
      return
    }
    res.json({ token: AUTH_TOKEN })
  })
}

// ── Server startup ──

export type StartServerOptions = {
  port?: number
  open?: boolean
  /**
   * Frozen snapshot of the launch shell's environment, captured BEFORE any
   * `process.env` mutation (the CLI sets `NODE_ENV=production` pre-import).
   * Required — there is deliberately no fallback to the server's own
   * (mutated) `process.env`; a caller that cannot supply a snapshot must
   * capture one at its entry point (see the dev direct-run path below).
   */
  childEnvBase: ChildEnvBase
}

/**
 * Start the dashboard server.
 *
 * Exported so the CLI can call it via dynamic import:
 *   const { startServer } = await import('./dashboard/server.js')
 *   await startServer({ port: 4173, open: true, childEnvBase })
 */
/**
 * Whether `pid` is positively identified as an OCR dashboard server — guards the
 * single-instance takeover so a recycled PID can't be mistaken for our server.
 * POSIX only (uses `ps`); returns false on Windows / any failure (conservative
 * — never reap something we can't positively identify).
 *
 * Primary: the `process.title` ('ocr-dashboard') we stamp at startup, anchored
 * at the start of the command so an unrelated `…/server.js` cannot false-match.
 * Fallback: the dashboard entrypoint path — kept ONLY because `process.title`
 * does not always reach `ps` on macOS. The substring was the sole gate before
 * and is too loose on its own (round-1 SF2).
 */
function isOcrDashboardProcess(pid: number): boolean {
  if (process.platform === 'win32') return false
  try {
    const cmd = (
      // Deliberate ambient spawn: argument-only `ps` identity probe; reads
      // nothing env-derived and runs before/independent of the child-env
      // snapshot (documented exception per the child-env posture spec).
      // eslint-disable-next-line no-restricted-syntax
      execBinary('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf-8',
        timeout: 3000,
      })
    ).trim()
    // Primary, positive identification: our stamped title at argv[0].
    if (/^ocr-dashboard\b/.test(cmd)) return true
    // Secondary fallback (macOS, where the title may not reach `ps`).
    return /dashboard\/server\.js|server\/index\.ts/.test(cmd)
  } catch {
    return false
  }
}

export async function startServer(options: StartServerOptions): Promise<void> {
  const port = options.port ?? parseInt(process.env.PORT ?? '4173', 10)

  // Register the frozen launch-shell snapshot exactly once — every spawn
  // path builds its child env from THIS, never from the server's own
  // (NODE_ENV-mutated) process.env. Registered before any service that
  // could spawn is constructed, so use-before-init is structurally
  // unreachable in this wiring.
  initChildEnvBase(options.childEnvBase)

  // Stamp a stable, positively-identifying process title so a later instance's
  // single-instance takeover can recognize THIS server (and never mistake a
  // recycled PID for it). `isOcrDashboardProcess` anchors on this. On Linux it
  // rewrites argv[0] (visible in `ps`); on macOS it may not reach `ps`, which is
  // why the identity check keeps an entrypoint-path fallback.
  process.title = 'ocr-dashboard'

  // Resolve .ocr directory
  const ocrDir = resolveOcrDir()
  const dashboardConfig = readDashboardConfig(ocrDir)
  if (dashboardConfig.sawRetiredEnvPassthrough) {
    // Courtesy for anyone who installed an unmerged PR #56 build: never an
    // error (a config file must not brick the dashboard), never silent
    // (dead config keys are a debuggability landmine).
    console.log(
      '  Config note:       dashboard.env_passthrough is no longer needed — ' +
        'dashboard children now inherit your shell environment; the key is ' +
        'ignored and can be deleted',
    )
  }
  const aiCliService = new AiCliService(ocrDir, dashboardConfig.aiCli)

  // ── WAL hygiene (best-effort, before opening the DB) ──
  // Best-effort WAL checkpoint before opening the shared connection —
  // reclaims any .db-wal left by another node:sqlite client.
  const dbPathForCheckpoint = join(ocrDir, 'data', 'ocr.db')
  const walResult = walCheckpointTruncate(dbPathForCheckpoint)
  if (walResult === 'checkpointed') {
    console.log('  WAL checkpoint:    truncated stale write-ahead-log file')
  }

  // ── Orphan .tmp reaping (best-effort) ──
  // Reclaim `ocr.db.<pid>.tmp` atomic-write leftovers from the retired sql.js
  // engine era (no current code writes them). PID-guarded + age-guarded so a
  // live mid-write temp is never touched. Reclaimed ~1 GB on a real machine.
  // Shared with `ocr db doctor --fix` (single source: cli/db maintenance).
  for (const reaped of reapOrphanDbFiles(join(ocrDir, 'data'))) {
    console.log(`  Orphan reap:       removed stale ${reaped}`)
  }

  // ── Stale exec-log reaping (best-effort) ──
  // The file-stdio sink writes one `<uid>.log` per review under data/exec-logs.
  // They are kept for post-mortem debugging but pruned past 7 days so they
  // can't grow without bound.
  const staleLogs = reapStaleExecLogs(join(ocrDir, 'data', 'exec-logs'))
  if (staleLogs.length > 0) {
    console.log(`  Exec-log reap:     removed ${staleLogs.length} stale agent log(s)`)
  }

  const db = await openDb(ocrDir)

  // ── Tracking files ──
  const dataDir = join(ocrDir, 'data')
  const pidFilePath = join(dataDir, 'dashboard.pid')
  const portFilePath = join(dataDir, 'server-port')
  mkdirSync(dataDir, { recursive: true })

  // Remove stale port file immediately so the Vite dev proxy does not
  // read a leftover port from a previous server instance. The correct
  // port is written after the server binds successfully.
  try { unlinkSync(portFilePath) } catch { /* may not exist */ }

  // ── PID tracking file ──
  // Write process PID so other tooling can detect an already-running server
  // and clean up orphaned processes.

  // ── Single-instance guard (take over a prior live server) ──
  // Previously this only WARNED and the listen path auto-incremented the port,
  // so multiple servers coexisted (two leaked ones ran ~29h in a real
  // incident). A single-user local-first tool should run exactly one dashboard:
  // if a prior OCR-dashboard process is alive, reap its whole tree (which also
  // cleans up any review subtree it leaked) and take over. A recycled PID that
  // isn't an OCR dashboard is left alone.
  if (existsSync(pidFilePath)) {
    try {
      const oldPid = parseInt(readFileSync(pidFilePath, 'utf-8').trim(), 10)
      if (!isNaN(oldPid) && oldPid !== process.pid && isProcessAlive(oldPid) && isOcrDashboardProcess(oldPid)) {
        console.log(`  Single-instance:   reaping prior dashboard server (PID ${oldPid}) and taking over`)
        reapTree(oldPid)
        // Brief wait for the port to free, then re-checkpoint the WAL the prior
        // server may have left open. Polled with an async sleep — `startServer`
        // is async, so this yields the event loop instead of hot-spinning a core
        // (the rest of the file already treats event-loop hygiene as a rule).
        const deadline = Date.now() + 6000
        while (isProcessAlive(oldPid) && Date.now() < deadline) {
          await new Promise<void>((resolve) => setTimeout(resolve, 100))
        }
        walCheckpointTruncate(dbPathForCheckpoint)
      }
    } catch {
      // Unreadable/recycled PID file — overwrite it.
    }
  }

  writeFileSync(pidFilePath, String(process.pid), { mode: 0o600 })

  // ── Command history recovery from JSONL backup ──
  // If the DB was recreated (command_executions is empty) but a JSONL backup
  // exists, replay it to restore command history.
  const cmdCountResult = db.exec('SELECT COUNT(*) as c FROM command_executions')
  const totalCmds = (cmdCountResult[0]?.values[0]?.[0] as number) ?? 0
  if (totalCmds === 0) {
    const recovered = replayCommandLog(db, ocrDir)
    if (recovered > 0) {
      console.log(`  Recovered ${recovered} command(s) from JSONL backup`)
    }
  }

  // ── Kill orphaned child processes ──
  // Before marking stale rows, check if any unfinished commands have PIDs
  // that are still alive and kill them. This handles the scenario where the
  // dashboard was shut down while AI commands were mid-execution.
  // Note: migrations have already been applied by openDb() above,
  // so the pid column is guaranteed to exist.
  const orphanResult = db.exec(
    `SELECT id, pid, started_at FROM command_executions
     WHERE pid IS NOT NULL AND finished_at IS NULL`
  )
  if (orphanResult.length > 0 && orphanResult[0]) {
    const { columns, values: orphanRows } = orphanResult[0]
    const colIdx = Object.fromEntries(columns.map((c, i) => [c, i]))

    // Same PID-reuse guard the periodic liveness sweep uses (shared constant).
    const cutoff = Date.now() - PID_REUSE_GUARD_MS
    let killedCount = 0

    for (const row of orphanRows) {
      const pid = row[colIdx['pid']!] as number
      const startedAt = row[colIdx['started_at']!] as string

      // Safety: skip PIDs from commands started beyond the reuse window
      // to avoid PID-reuse issues with very old stale entries
      if (sqliteUtcMs(startedAt) < cutoff) continue

      // Only act on genuinely-live processes (the shared liveness probe).
      if (defaultIsAlive(pid)) {
        // Reap the WHOLE descendant tree, robust to a setsid()-escaped
        // grandchild (e.g. a leaked MCP daemon) — the exact failure mode that
        // produced the wedge. The pre-PR `kill(-pid)` + manual SIGKILL
        // escalation here would miss it, recurring the bug at every restart
        // boundary. `reapTree` walks the tree for both detached and
        // non-detached roots, so the `is_detached` branch is gone. Note the
        // SIGKILL escalation rides an unref'd timer inside reapTree — it fires
        // here because the server stays alive past the grace (unlike the
        // shutdown boundary, which must await it explicitly).
        reapTree(pid)
        killedCount++
      }
      // else: process not running — PID is stale, cleaned up below.
    }

    if (killedCount > 0) {
      console.log(`  Reaped ${killedCount} orphaned process tree(s)`)
    }
  }

  // Backfill the exit code on legacy rows that FINISHED but never recorded one
  // (an old SIGTERM-handling bug). In-flight rows (finished_at IS NULL) are
  // deliberately NOT terminated here — they are reclaimed by the orphan-kill
  // block above (signals) and the liveness sweep below, which gives a terminal
  // verdict only on a confirmed-dead pid. Blanket-cancelling in-flight rows here
  // would stamp a LIVE process `-2` on every dashboard restart — the exact
  // false-terminal class the liveness sweep exists to prevent.
  const legacyResult = db.exec(
    "SELECT COUNT(*) as c FROM command_executions WHERE finished_at IS NOT NULL AND exit_code IS NULL"
  )
  const legacyCount = (legacyResult[0]?.values[0]?.[0] as number) ?? 0
  if (legacyCount > 0) {
    db.run(
      `UPDATE command_executions
       SET exit_code = ?,
           output = COALESCE(output, '') || '\n[Cancelled]'
       WHERE finished_at IS NOT NULL AND exit_code IS NULL`,
      [CANCELLED_EXIT_CODE]
    )
    console.log(`  Backfilled ${legacyCount} finished command(s) missing an exit code`)
  }

  // ── Agent-session liveness sweep ──
  // Reclaims supervision rows whose process is genuinely DEAD (probed via
  // `defaultIsAlive`), stamping them `orphaned`. Heartbeat age only bounds
  // which rows are worth probing — a live pid is never orphaned, however stale
  // its heartbeat. Fires on dashboard startup AND via the periodic timer below.
  const heartbeatSeconds = getAgentHeartbeatSeconds(ocrDir)
  // Shared so the startup sweep AND the periodic timer report identically — a
  // cascade fired on the (higher-traffic) periodic callsite must not vanish.
  const logAgentSweep = (result: {
    orphanedIds: string[]
    cascadedWorkflowIds: string[]
  }): void => {
    if (result.orphanedIds.length === 0) return
    const cascaded = result.cascadedWorkflowIds.length
    console.log(
      `  Cleaned up ${result.orphanedIds.length} stale agent session(s) (heartbeat threshold ${heartbeatSeconds}s)` +
      (cascaded > 0 ? `; cascade-closed dependents of ${cascaded} workflow(s)` : '')
    )
  }
  logAgentSweep(sweepStaleAgentSessions(db, heartbeatSeconds, defaultIsAlive))

  // ── Stale-active sessions sweep ──
  // Closes sessions.status='active' rows that have had no events past the
  // threshold AND have no in-flight dependent rows. Without this, sessions
  // that crashed early (or initialised but never advanced) accumulate
  // forever and poison auto-detect (latest-active picks wrong).
  const STALE_SESSION_THRESHOLD_SECONDS = 7 * 24 * 60 * 60 // 7 days
  const staleSessionResult = sweepStaleSessions(
    db,
    STALE_SESSION_THRESHOLD_SECONDS,
  )
  if (staleSessionResult.closedSessionIds.length > 0) {
    console.log(
      `  Auto-closed ${staleSessionResult.closedSessionIds.length} stale active session(s) (threshold 7 days)`
    )
  }

  // ── Completed-but-open session reconciliation ──
  // Recover the wedge's lasting symptom: a session whose round is provably
  // complete (`round_completed`/`map_completed` event) but whose status stayed
  // `active` because the agent died before `ocr state finish`. Runs AFTER the
  // liveness sweep above so any dead-PID executions are already finalized —
  // only then is the session quiesced and eligible to close. The per-execution
  // hook (finishExecution → reconcileWorkflowOnExit) handles the live path;
  // this startup pass handles sessions whose finishing execution fired while no
  // dashboard was running. Drives close through the guarded `stateClose`.
  const reconcileCompleted = async (): Promise<void> => {
    try {
      const closed = await reconcileCompletedSessions(ocrDir)
      if (closed.length > 0) {
        console.log(
          `  Auto-finalized ${closed.length} completed-but-open session(s)`
        )
      }
    } catch (err) {
      console.error('[reconcile] completed-session reconciliation failed:', err)
    }
  }
  await reconcileCompleted()

  // ── Forward-resume sweep ──
  // Recover INCOMPLETE stranded mid-pipeline runs (the #146 class) that
  // Auto-Finalize deliberately leaves alone: active, no terminal artifact, and a
  // positively-dead owning turn. Runs AFTER the liveness + completed-but-open
  // passes so only genuinely-incomplete, dead runs remain. Triggers the SAME CLI
  // primitive a human would (`ocr review --resume`), which owns the lease/cap/
  // adapter; the sweep owns only the death-evidence gate and the cap-close.
  const forwardResumeMaxAttempts = getForwardResumeMaxAttempts(ocrDir)
  // Extracted to services/forward-resume-spawn.ts so the builder-env
  // convergence at this site is unit-pinned and lint-covered (this file
  // cannot join the process.env ban — it reads server config legitimately).
  const spawnResume = makeSpawnResume(ocrDir)
  const runForwardResume = (): void => {
    try {
      runForwardResumeSweep({
        db,
        config: { maxAttempts: forwardResumeMaxAttempts, heartbeatMs: heartbeatSeconds * 1000 },
        maxAttempts: forwardResumeMaxAttempts,
        spawnResume,
        log: (m) => console.log(`  ${m}`),
      })
    } catch (err) {
      console.error('[ForwardResume] sweep failed:', err)
    }
  }
  runForwardResume()

  // ── Periodic sweep timer ──
  // Runs every 5 minutes inside the running dashboard so liveness and
  // stale-session cleanup keep happening without a restart. Each sweep
  // is cheap (single SQL update per sweep type); 5 min keeps the cadence
  // responsive without DB pressure.
  const SWEEP_INTERVAL_MS = 5 * 60 * 1000
  const sweepTimer = setInterval(() => {
    try {
      logAgentSweep(sweepStaleAgentSessions(db, heartbeatSeconds, defaultIsAlive))
      sweepStaleSessions(db, STALE_SESSION_THRESHOLD_SECONDS)
      // Fire-and-forget: liveness sweep (sync, above) may have just finalized a
      // dead workflow's last execution, making its completed session eligible.
      void reconcileCompleted()
      // And recover any incomplete stranded mid-pipeline runs.
      runForwardResume()
    } catch (err) {
      console.error('[sweep] periodic sweep failed:', err)
    }
  }, SWEEP_INTERVAL_MS)
  // Don't block process exit on the timer.
  sweepTimer.unref()

  // ── API Routes ──

  // GET /api/reviews — all review rounds across sessions
  app.get('/api/reviews', (_req, res) => {
    try {
      const rounds = getAllRounds(db).map((r) => ({
        ...r,
        reviewer_outputs: getReviewerOutputsForRound(db, r.id),
        progress: getRoundProgress(db, r.id) ?? null,
      }))
      res.json(rounds)
    } catch (err) {
      console.error('Failed to fetch reviews:', err)
      res.status(500).json({ error: 'Failed to fetch reviews' })
    }
  })

  app.use('/api/sessions', createSessionsRouter(db))
  app.use('/api/sessions', createReviewsRouter(db))
  app.use('/api/sessions', createMapsRouter(db))
  app.use('/api/sessions', createArtifactsRouter(db))
  app.use('/api', createProgressRouter(db))
  app.use('/api/notes', createNotesRouter(db))
  app.use('/api/stats', createStatsRouter(db))
  app.use('/api/commands', createCommandsRouter(db, ocrDir))
  app.use('/api/config', createConfigRouter(ocrDir, aiCliService))
  app.use('/api/sessions', createChatRouter(db))
  app.use('/api/reviewers', createReviewersRouter(ocrDir))
  // Pull-on-read for agent_session-backed routes: they read tables
  // (sessions, agent_sessions) that the CLI writes via atomic rename.
  // Calling syncFromDisk before serving each request makes the routes
  // deterministic regardless of watcher debounce/timing — the watcher
  // remains the push-based path for socket.io invalidation events.
  // The actual `pullSync` callback is wired below after DbSyncWatcher
  // is constructed; the hook here is closure-captured.
  let pullSync: () => void = () => {}
  // Single SessionCaptureService instance shared across the route + the
  // command-runner. Avoids the previous "two default-constructed services"
  // shape — both surfaces now write through the same façade, so future
  // per-instance state (caches, metrics) has one home.
  const sessionCapture = createSessionCaptureService({ db, ocrDir, aiCliService })
  app.use('/api/agent-sessions', createAgentSessionsRouter(db, () => pullSync()))
  app.use('/api/sessions', createHandoffRouter(sessionCapture, ocrDir, () => pullSync()))
  app.use('/api/team', createTeamRouter(ocrDir))

  // ── Static file serving (production) ──

  const clientDir = join(__dirname, 'client')
  if (process.env.NODE_ENV === 'production' && existsSync(clientDir)) {
    // Serve static assets (JS, CSS, images, etc.) without modification
    app.use(express.static(clientDir, { index: false }))

    // For index.html requests, inject the auth token as a script tag
    const indexHtmlPath = join(clientDir, 'index.html')
    const rawIndexHtml = existsSync(indexHtmlPath)
      ? readFileSync(indexHtmlPath, 'utf-8')
      : ''
    const tokenScript = `<script>window.__OCR_TOKEN__=${JSON.stringify(AUTH_TOKEN)};</script>`
    const injectedIndexHtml = rawIndexHtml.replace(
      '</head>',
      `  ${tokenScript}\n  </head>`,
    )

    // SPA fallback — serve the token-injected HTML for all non-API routes
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
        res.type('html').send(injectedIndexHtml)
      }
    })
  }

  // ── Socket.IO ──

  io.on('connection', (socket) => {
    registerSocketHandlers(io, socket)
    registerCommandHandlers(io, socket, db, ocrDir, aiCliService, sessionCapture)
    registerChatHandlers(io, socket, db, ocrDir, aiCliService)
    registerPostHandlers(io, socket, db, ocrDir, aiCliService)
  })

  // ── DB sync watcher ──
  // Watches .ocr/data/ocr.db for external writes (from CLI `ocr state` commands)
  // and emits Socket.IO notifications for sessions + orchestration_events
  // changes. The DB is shared on disk (node:sqlite + WAL) — the watcher
  // diffs the live connection against cached snapshots; it does not merge.

  const dbFilePath = join(ocrDir, 'data', 'ocr.db')
  const dbSyncWatcher = new DbSyncWatcher(
    db,
    dbFilePath,
    io,
    // Auto-link the dashboard's parent execution row when the AI
    // creates a new session via `ocr state begin`. Eliminates the
    // dependency on env-var/flag propagation through the AI's shell.
    (session) => {
      sessionCapture.autoLinkPendingDashboardExecution(session.id)
    },
  )
  await dbSyncWatcher.init()
  dbSyncWatcher.startWatching()
  // Wire the pull-on-read sync callback now that DbSyncWatcher exists.
  // (Defined as a `let` above so the closure captured by the route
  // factories resolves to the real method here at request time.)
  pullSync = () => dbSyncWatcher.syncFromDisk()
  console.log(`  Watching DB:       ${shortenPath(dbFilePath)}`)

  // ── Filesystem sync ──
  // Parses .ocr/sessions/ markdown artifacts into SQLite,
  // then watches for live changes from CLI / agent workflows.

  const sessionsDir = join(ocrDir, 'sessions')
  const fsSync = new FilesystemSync(db, sessionsDir, io)
  await fsSync.fullScan()
  fsSync.startWatching()
  console.log(`  Watching sessions: ${shortenPath(sessionsDir)}`)

  // ── Reviewers meta watcher ──
  const stopReviewersWatch = watchReviewersMeta(ocrDir, io)

  // ── Start server ──

  const MAX_PORT_ATTEMPTS = 10
  let actualPort = port

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => reject(err)
        httpServer.once('error', onError)

        httpServer.listen(actualPort, '127.0.0.1', () => {
          httpServer.removeListener('error', onError)
          resolve()
        })
      })
      break // Success
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException
      if (nodeErr.code === 'EADDRINUSE') {
        httpServer.close()

        if (attempt < MAX_PORT_ATTEMPTS - 1) {
          console.log(`  Port ${actualPort} in use, trying ${actualPort + 1}...`)
          actualPort++
        } else {
          throw new Error(
            `Could not find an available port (tried ${port}–${actualPort}). ` +
            `Stop other processes or set PORT explicitly.`
          )
        }
      } else {
        throw err
      }
    }
  }

  if (actualPort !== port) {
    console.log(`  Note: using port ${actualPort} (${port} was in use)`)
  }

  // Write actual port so the Vite dev proxy can discover it.
  // In dev mode, Vite starts after the server (sleep 2) and reads this file.
  writeFileSync(portFilePath, String(actualPort), { mode: 0o600 })

  console.log(`  Server:            http://localhost:${actualPort}`)
  console.log(`  OCR directory:     ${shortenPath(ocrDir)}`)
  console.log()
  console.log(`  Auth token:        ${AUTH_TOKEN.slice(0, 8)}...[redacted]`)
  {
    // Env posture, delta only (names, never values): what children WON'T
    // see. Recomputed via the same builder + constants every spawn uses
    // (deterministic in the frozen base), with the same vocabulary as the
    // log header and failure hint so the surfaces correlate.
    const base = getChildEnvBase()
    const { removed } = childEnv()
    console.log(
      `  Child env:         inheriting your shell environment ` +
        `(shell snapshot ${base.capturedAt}, source: ${base.source})`,
    )
    if (removed.length > 0) {
      console.log(`                     removed: ${removed.join(', ')}`)
    }
    console.log(
      `                     variables exported after this are invisible to ` +
        `children; restart 'ocr dashboard' to pick them up`,
    )
  }
  console.log()

  // ── Browser auto-open (when called with open: true) ──

  if (options.open) {
    try {
      const { default: openBrowser } = await import('open')
      await openBrowser(`http://localhost:${actualPort}`)
    } catch {
      // Non-fatal — user can open the URL manually
    }
  }

  // ── Graceful shutdown ──

  // Async so the child-reap path can hold the process open just past the
  // SIGKILL-escalation grace (see below) — signal handlers tolerate a
  // promise-returning callback fine.
  const shutdown = async (signal?: NodeJS.Signals): Promise<void> => {
    console.log(
      `Shutting down dashboard server${signal ? ` (received ${signal})` : ''}...`,
    )

    // Remove PID and port tracking files
    try { unlinkSync(pidFilePath) } catch { /* ignore */ }
    try { unlinkSync(portFilePath) } catch { /* ignore */ }
    // Remove all dashboard spawn markers (used by CLI's `ocr state begin`
    // for durable workflow_id linkage). Cleared here so a crash-mid-spawn
    // doesn't leave a stale marker pointing at a dead PID. Shared helper so the
    // marker path is defined in exactly one place (round-1 S22); clears the
    // whole per-execution marker dir + legacy single file (round-1 S25).
    clearAllSpawnMarkers(ocrDir)

    // Kill all child processes tracked in the database.
    // This is more robust than the in-memory Maps (which are lost on hot-reload).
    try {
      const activeResult = db.exec(
        'SELECT id, pid FROM command_executions WHERE pid IS NOT NULL AND finished_at IS NULL'
      )
      if (activeResult.length > 0 && activeResult[0]) {
        const { columns, values: activeRows } = activeResult[0]
        const colIdx = Object.fromEntries(columns.map((c, i) => [c, i]))

        for (const row of activeRows) {
          const pid = row[colIdx['pid']!] as number

          // Reap the whole descendant tree with a SHORT grace (vs the 5s
          // default): reapTree's SIGKILL escalation rides an unref'd timer, and
          // this process force-exits within ~2s — a 5s grace would never fire
          // here, leaving shutdown SIGTERM-only (round-2 SF3). 750ms fits the
          // budget; the await below keeps the process alive long enough for the
          // escalation (and its straggler WARN) to actually run.
          reapTree(pid, 750)
          console.log(`Reaping child process tree (PID ${pid})`)
        }

        // Hold the process open just past the escalation grace so SIGKILL +
        // the straggler diagnostic fire BEFORE the pid-nulling UPDATE below
        // makes any survivor invisible to the next startup's orphan sweep.
        // (Keeping pids populated instead would not help: once the root dies,
        // a setsid()-escaped survivor reparents to PID 1 and no post-hoc tree
        // walk can find it — the only effective window is right now.)
        await new Promise<void>((resolve) => setTimeout(resolve, 1000))

        // Clear PIDs and mark as cancelled
        db.run(
          `UPDATE command_executions
           SET exit_code = ?, finished_at = datetime('now'),
               output = COALESCE(output, '') || '\n[Cancelled — server shutdown]',
               pid = NULL
           WHERE pid IS NOT NULL AND finished_at IS NULL`,
          [CANCELLED_EXIT_CODE]
        )
      }
    } catch (err) {
      console.error('Error killing child processes on shutdown:', err)
    }

    cleanupAllChats()
    cleanupAllPostGenerations()

    dbSyncWatcher.stopWatching()
    fsSync.stopWatching()
    stopReviewersWatch()
    io.close()
    // Without this, keep-alive connections from the Vite dev proxy
    // (long-lived `/socket.io` upgrades, /api keep-alives) hold the
    // server open indefinitely; httpServer.close()'s callback never
    // fires and tsx watch force-kills before our cleanup completes.
    httpServer.closeAllConnections()
    httpServer.close(() => {
      closeDb()
      console.log('Server stopped.')
      process.exit(0)
    })

    // Force exit after 2 seconds — closeAllConnections() should make
    // the close callback fire near-instantly; if it doesn't, something
    // is holding a non-HTTP handle open and we shouldn't wait long.
    setTimeout(() => {
      console.error('Forced shutdown after timeout')
      process.exit(1)
    }, 2000).unref()
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGHUP', () => void shutdown('SIGHUP'))
  // Surface the proximate cause of unexpected shutdowns. Diagnostic only —
  // these don't trigger graceful shutdown themselves; node will already
  // either crash or carry on depending on its config.
  process.on('uncaughtException', (err) => {
    console.error('[dashboard] uncaughtException:', err)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[dashboard] unhandledRejection:', reason)
  })
}

// Auto-start when run directly (e.g., `tsx watch src/server/index.ts`
// or `node dist/server.js`). When imported by the CLI via dynamic import,
// the CLI calls startServer() explicitly — process.argv[1] will point
// to the CLI entry, not this file, so auto-start won't fire.
const selfPath = fileURLToPath(import.meta.url)
const argPath = process.argv[1] ? resolve(process.argv[1]) : ''
const isDirectRun = argPath === selfPath

if (isDirectRun) {
  // Direct run has no CLI wrapper to capture the pre-mutation snapshot, so
  // capture at entry — nothing has mutated process.env yet on this path.
  startServer({ childEnvBase: captureChildEnvBase('dev-direct-run') }).catch((err) => {
    console.error('Failed to start dashboard server:', err)
    process.exit(1)
  })
}

export { app, httpServer, io }
