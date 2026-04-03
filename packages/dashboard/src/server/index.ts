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
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { Server as SocketIOServer } from 'socket.io'

import { resolveOcrDir } from './services/ocr-resolver.js'
import { openDb, closeDb, saveDb, registerSaveHooks, getAllRounds, getReviewerOutputsForRound, getRoundProgress } from './db.js'
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
import { AiCliService } from './services/ai-cli/index.js'
import { FilesystemSync } from './services/filesystem-sync.js'
import { DbSyncWatcher } from './services/db-sync-watcher.js'
import { registerCommandHandlers } from './socket/command-runner.js'
import { registerChatHandlers, cleanupAllChats } from './socket/chat-handler.js'
import { registerPostHandlers, cleanupAllPostGenerations } from './socket/post-handler.js'
import { flushSave } from './routes/progress.js'
import { replayCommandLog } from '@open-code-review/cli/db'

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
}

/**
 * Start the dashboard server.
 *
 * Exported so the CLI can call it via dynamic import:
 *   const { startServer } = await import('./dashboard/server.js')
 *   await startServer({ port: 4173, open: true })
 */
export async function startServer(options: StartServerOptions = {}): Promise<void> {
  const port = options.port ?? parseInt(process.env.PORT ?? '4173', 10)

  // Resolve .ocr directory
  const ocrDir = resolveOcrDir()
  const aiCliService = new AiCliService(ocrDir)
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

  if (existsSync(pidFilePath)) {
    try {
      const oldPid = parseInt(readFileSync(pidFilePath, 'utf-8').trim(), 10)
      if (!isNaN(oldPid)) {
        try {
          process.kill(oldPid, 0)
          console.warn(
            `Warning: another dashboard server (PID ${oldPid}) appears to be running. ` +
            `If this is stale, delete ${pidFilePath} and restart.`
          )
        } catch {
          // Process not running — stale PID file, safe to overwrite
        }
      }
    } catch {
      // Could not read PID file — overwrite it
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
      saveDb(db, ocrDir)
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
    `SELECT id, pid, is_detached, started_at FROM command_executions
     WHERE pid IS NOT NULL AND finished_at IS NULL`
  )
  if (orphanResult.length > 0 && orphanResult[0]) {
    const { columns, values: orphanRows } = orphanResult[0]
    const colIdx = Object.fromEntries(columns.map((c, i) => [c, i]))

    const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24 hours
    let killedCount = 0

    for (const row of orphanRows) {
      const pid = row[colIdx['pid']!] as number
      const isDetached = (row[colIdx['is_detached']!] as number) === 1
      const startedAt = row[colIdx['started_at']!] as string

      // Safety: skip PIDs from commands started more than 24 hours ago
      // to avoid PID-reuse issues with very old stale entries
      if (new Date(startedAt).getTime() < cutoff) continue

      try {
        // Check if process is still alive (signal 0 = no signal, just check)
        process.kill(pid, 0)

        // Process is alive — kill it
        if (isDetached) {
          try { process.kill(-pid, 'SIGTERM') } catch { process.kill(pid, 'SIGTERM') }
        } else {
          process.kill(pid, 'SIGTERM')
        }
        killedCount++

        // Escalate to SIGKILL after 2 seconds for stubborn processes
        setTimeout(() => {
          try {
            process.kill(pid, 0) // still alive?
            if (isDetached) {
              try { process.kill(-pid, 'SIGKILL') } catch { /* ignore */ }
            }
            process.kill(pid, 'SIGKILL')
          } catch { /* already dead */ }
        }, 2000)
      } catch {
        // Process not running — PID is stale, will be cleaned up below
      }
    }

    if (killedCount > 0) {
      console.log(`  Cleaned up ${killedCount} orphaned process(es)`)
    }
  }

  // Mark any command_executions left in a broken state as cancelled.
  // Covers two cases:
  //   1. finished_at IS NULL — process was running when server stopped
  //   2. exit_code IS NULL — old bug where SIGTERM-killed processes stored null exit code
  const staleResult = db.exec(
    "SELECT COUNT(*) as c FROM command_executions WHERE finished_at IS NULL OR exit_code IS NULL"
  )
  const staleCount = (staleResult[0]?.values[0]?.[0] as number) ?? 0
  if (staleCount > 0) {
    db.run(
      `UPDATE command_executions
       SET exit_code = -2, finished_at = COALESCE(finished_at, datetime('now')),
           output = COALESCE(output, '') || '\n[Cancelled]',
           pid = NULL
       WHERE finished_at IS NULL OR exit_code IS NULL`
    )
    saveDb(db, ocrDir)
    console.log(`  Cleaned up ${staleCount} stale command(s)`)
  }

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
  app.use('/api', createProgressRouter(db, ocrDir))
  app.use('/api/notes', createNotesRouter(db, ocrDir))
  app.use('/api/stats', createStatsRouter(db))
  app.use('/api/commands', createCommandsRouter(db))
  app.use('/api/config', createConfigRouter(ocrDir, aiCliService))
  app.use('/api/sessions', createChatRouter(db, ocrDir))
  app.use('/api/reviewers', createReviewersRouter(ocrDir))

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
    registerCommandHandlers(io, socket, db, ocrDir, aiCliService)
    registerChatHandlers(io, socket, db, ocrDir, aiCliService)
    registerPostHandlers(io, socket, db, ocrDir, aiCliService)
  })

  // ── DB sync watcher ──
  // Watches .ocr/data/ocr.db for external writes (from CLI `ocr state` commands)
  // and syncs sessions + orchestration_events into the in-memory DB.

  const dbFilePath = join(ocrDir, 'data', 'ocr.db')
  const dbSyncWatcher = new DbSyncWatcher(db, dbFilePath, io, () => {
    saveDb(db, ocrDir)
  })
  await dbSyncWatcher.init()
  dbSyncWatcher.startWatching()
  console.log(`  Watching DB:       ${shortenPath(dbFilePath)}`)

  // Register global save hooks so every saveDb() call automatically
  // merges CLI changes before writing and marks its own write.
  registerSaveHooks(
    () => dbSyncWatcher.syncFromDisk(),
    () => dbSyncWatcher.markOwnWrite(),
  )

  // ── Filesystem sync ──
  // Parses .ocr/sessions/ markdown artifacts into SQLite,
  // then watches for live changes from CLI / agent workflows.

  const sessionsDir = join(ocrDir, 'sessions')
  const fsSync = new FilesystemSync(db, sessionsDir, io, () => saveDb(db, ocrDir))
  await fsSync.fullScan()
  saveDb(db, ocrDir)
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

  const shutdown = (): void => {
    console.log('Shutting down dashboard server...')

    // Remove PID and port tracking files
    try { unlinkSync(pidFilePath) } catch { /* ignore */ }
    try { unlinkSync(portFilePath) } catch { /* ignore */ }

    // Kill all child processes tracked in the database.
    // This is more robust than the in-memory Maps (which are lost on hot-reload).
    try {
      const activeResult = db.exec(
        'SELECT id, pid, is_detached FROM command_executions WHERE pid IS NOT NULL AND finished_at IS NULL'
      )
      if (activeResult.length > 0 && activeResult[0]) {
        const { columns, values: activeRows } = activeResult[0]
        const colIdx = Object.fromEntries(columns.map((c, i) => [c, i]))

        for (const row of activeRows) {
          const pid = row[colIdx['pid']!] as number
          const isDetached = (row[colIdx['is_detached']!] as number) === 1

          try {
            if (isDetached) {
              try { process.kill(-pid, 'SIGTERM') } catch { process.kill(pid, 'SIGTERM') }
            } else {
              process.kill(pid, 'SIGTERM')
            }
            console.log(`Sent SIGTERM to child process (PID ${pid})`)
          } catch { /* already dead */ }
        }

        // Clear PIDs and mark as cancelled
        db.run(
          `UPDATE command_executions
           SET exit_code = -2, finished_at = datetime('now'),
               output = COALESCE(output, '') || '\n[Cancelled — server shutdown]',
               pid = NULL
           WHERE pid IS NOT NULL AND finished_at IS NULL`
        )
      }
    } catch (err) {
      console.error('Error killing child processes on shutdown:', err)
    }

    cleanupAllChats()
    cleanupAllPostGenerations()

    // Flush any pending debounced progress writes (500ms window)
    try { flushSave() } catch { /* ignore */ }

    // Flush all pending changes before stopping watchers
    try { saveDb(db, ocrDir) } catch { /* DB may not be writable during shutdown */ }

    dbSyncWatcher.stopWatching()
    fsSync.stopWatching()
    stopReviewersWatch()
    io.close()
    httpServer.close(() => {
      try { saveDb(db, ocrDir) } catch { /* ignore */ }
      closeDb()
      console.log('Server stopped.')
      process.exit(0)
    })

    // Force exit after 5 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout')
      process.exit(1)
    }, 5000)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// Auto-start when run directly (e.g., `tsx watch src/server/index.ts`
// or `node dist/server.js`). When imported by the CLI via dynamic import,
// the CLI calls startServer() explicitly — process.argv[1] will point
// to the CLI entry, not this file, so auto-start won't fire.
const selfPath = fileURLToPath(import.meta.url)
const argPath = process.argv[1] ? resolve(process.argv[1]) : ''
const isDirectRun = argPath === selfPath

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start dashboard server:', err)
    process.exit(1)
  })
}

export { app, httpServer, io }
