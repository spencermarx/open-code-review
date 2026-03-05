/**
 * Dashboard server entry point.
 *
 * Express + Socket.IO server that serves the dashboard API
 * and static client files in production.
 */

import express from 'express'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { FilesystemSync } from './services/filesystem-sync.js'
import { DbSyncWatcher } from './services/db-sync-watcher.js'
import { registerCommandHandlers } from './socket/command-runner.js'
import { registerChatHandlers, cleanupAllChats } from './socket/chat-handler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
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
  const db = await openDb(ocrDir)

  // Mark any command_executions left in "running" state as cancelled
  // (happens when the server restarts while a command is active)
  const staleResult = db.exec(
    "SELECT COUNT(*) as c FROM command_executions WHERE finished_at IS NULL"
  )
  const staleCount = (staleResult[0]?.values[0]?.[0] as number) ?? 0
  if (staleCount > 0) {
    db.run(
      `UPDATE command_executions
       SET exit_code = -2, finished_at = datetime('now'), output = COALESCE(output, '') || '\n[Cancelled: server restarted]'
       WHERE finished_at IS NULL`
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
      res.status(500).json({ error: 'Failed to fetch reviews', detail: String(err) })
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
  app.use('/api/config', createConfigRouter(ocrDir))
  app.use('/api/sessions', createChatRouter(db, ocrDir))

  // ── Static file serving (production) ──

  const clientDir = join(__dirname, 'client')
  if (process.env.NODE_ENV === 'production' && existsSync(clientDir)) {
    app.use(express.static(clientDir))

    // SPA fallback
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
        res.sendFile(join(clientDir, 'index.html'))
      }
    })
  }

  // ── Socket.IO ──

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)
    registerSocketHandlers(io, socket)
    registerCommandHandlers(io, socket, db, ocrDir)
    registerChatHandlers(io, socket, db, ocrDir)
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

  // Helper: save + mark own write so the watcher doesn't re-trigger
  const saveAndMark = (): void => {
    saveDb(db, ocrDir)
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

    httpServer.listen(port, () => {
      console.log(`Dashboard server running on http://localhost:${port}`)
      console.log(`OCR directory: ${ocrDir}`)
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
    cleanupAllChats()
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
