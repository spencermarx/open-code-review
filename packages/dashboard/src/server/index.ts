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
import { openDb, closeDb, saveDb, getAllRounds, getReviewerOutputsForRound, getRoundProgress } from './db.js'
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
import { AiCliService } from './services/ai-cli/index.js'
import { FilesystemSync } from './services/filesystem-sync.js'
import { DbSyncWatcher } from './services/db-sync-watcher.js'
import { registerCommandHandlers } from './socket/command-runner.js'
import { registerChatHandlers, cleanupAllChats } from './socket/chat-handler.js'
import { registerPostHandlers, cleanupAllPostGenerations } from './socket/post-handler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Bearer token authentication ──
// Generate a cryptographically random token at startup.
// All API and Socket.IO requests must present this token.
const AUTH_TOKEN = randomBytes(32).toString('hex')

const app = express()
const httpServer = createServer(app)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NODE_ENV !== 'production'
      ? ['http://localhost:5173', 'http://localhost:4173']
      : false,
  },
})

// ── Middleware ──

app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use((_req, res, next) => {
    const origin = _req.headers.origin
    const allowed = ['http://localhost:5173', 'http://localhost:4173']
    if (origin && allowed.includes(origin)) {
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
  app.get('/auth/token', (_req, res) => {
    res.json({ token: AUTH_TOKEN })
  })
}

// ── Health check (available before DB init) ──

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// ── Server startup ──

export interface StartServerOptions {
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

  // ── PID tracking file ──
  // Write process PID so other tooling can detect an already-running server
  // and clean up orphaned processes.
  const dataDir = join(ocrDir, 'data')
  const pidFilePath = join(dataDir, 'dashboard.pid')
  mkdirSync(dataDir, { recursive: true })

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
           output = COALESCE(output, '') || '\n[Cancelled]'
       WHERE finished_at IS NULL OR exit_code IS NULL`
    )
    saveDb(db, ocrDir)
    console.log(`Cleaned up ${staleCount} stale command execution(s)`)
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
    console.log('Client connected:', socket.id)
    registerSocketHandlers(io, socket)
    registerCommandHandlers(io, socket, db, ocrDir, aiCliService)
    registerChatHandlers(io, socket, db, ocrDir, aiCliService)
    registerPostHandlers(io, socket, db, ocrDir, aiCliService)
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  // ── DB sync watcher ──
  // Watches .ocr/data/ocr.db for external writes (from CLI `ocr state` commands)
  // and syncs sessions + orchestration_events into the in-memory DB.

  const dbFilePath = join(ocrDir, 'data', 'ocr.db')
  const dbSyncWatcher = new DbSyncWatcher(db, dbFilePath, io, () => {
    saveDb(db, ocrDir)
    dbSyncWatcher.markOwnWrite()
  })
  await dbSyncWatcher.init()
  dbSyncWatcher.startWatching()
  console.log(`Watching DB: ${dbFilePath}`)

  // Helper: save + mark own write so the watcher doesn't re-trigger.
  // Passes syncFromDisk as preSaveSync to merge CLI changes before overwriting.
  const saveAndMark = (): void => {
    saveDb(db, ocrDir, () => dbSyncWatcher.syncFromDisk())
    dbSyncWatcher.markOwnWrite()
  }

  // ── Filesystem sync ──
  // Parses .ocr/sessions/ markdown artifacts into SQLite,
  // then watches for live changes from CLI / agent workflows.

  const sessionsDir = join(ocrDir, 'sessions')
  const fsSync = new FilesystemSync(db, sessionsDir, io, saveAndMark)
  await fsSync.fullScan()
  saveAndMark()
  fsSync.startWatching()
  console.log(`Watching sessions: ${sessionsDir}`)

  // ── Start server ──

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use. Either stop the other process ` +
          `(lsof -ti:${port} | xargs kill) or choose a different port ` +
          `(PORT=${port + 1} pnpm dev:server).`
        ))
      } else {
        reject(err)
      }
    })

    httpServer.listen(port, '127.0.0.1', () => {
      console.log(`Dashboard server running on http://localhost:${port}`)
      console.log(`OCR directory: ${ocrDir}`)
      console.log('')
      console.log('='.repeat(60))
      console.log('  AUTH TOKEN (bearer token for API / Socket.IO):')
      console.log(`  ${AUTH_TOKEN}`)
      console.log('='.repeat(60))
      console.log('')
      resolve()
    })
  })

  // ── Browser auto-open (when called with open: true) ──

  if (options.open) {
    try {
      const { default: openBrowser } = await import('open')
      await openBrowser(`http://localhost:${port}`)
    } catch {
      // Non-fatal — user can open the URL manually
    }
  }

  // ── Graceful shutdown ──

  const shutdown = (): void => {
    console.log('Shutting down dashboard server...')

    // Remove PID tracking file
    try { unlinkSync(pidFilePath) } catch { /* ignore */ }

    cleanupAllChats()
    cleanupAllPostGenerations()
    dbSyncWatcher.stopWatching()
    fsSync.stopWatching()
    io.close()
    httpServer.close(() => {
      saveDb(db, ocrDir)
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
