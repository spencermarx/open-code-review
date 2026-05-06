import { defineConfig, createLogger } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Discover the server port. Priority:
 * 1. PORT env var — set by scripts/dev.ts after the server binds,
 *    guaranteeing the correct port with zero race condition
 * 2. `.ocr/data/server-port` file — fallback for manual Vite starts
 * 3. Default 4173
 */
function resolveServerPort(): number {
  if (process.env.PORT) return parseInt(process.env.PORT, 10)

  let dir = process.cwd()
  while (true) {
    const portFile = join(dir, '.ocr', 'data', 'server-port')
    if (existsSync(portFile)) {
      const port = parseInt(readFileSync(portFile, 'utf-8').trim(), 10)
      if (!isNaN(port)) return port
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return 4173
}

const serverPort = resolveServerPort()

/**
 * Vite logs `[vite] ws proxy socket error: ...` whenever the underlying
 * websocket socket emits an `error` event during a proxied upgrade. The
 * common cause is benign client disconnects mid-write (browser tab
 * close/refresh, network blips) which surface as EPIPE/ECONNRESET — the
 * server is fine, the client just went away.
 *
 * The error handler that logs this is attached to the *socket* by Vite
 * internals, not to the http-proxy instance — so a `proxy.on('error')`
 * listener in the proxy `configure` callback never fires for these.
 *
 * The robust suppression point is the logger itself: wrap the default
 * Vite logger and drop the specific noise pattern. Real proxy errors
 * (4xx/5xx upstream, connection refused, timeouts) flow through other
 * code paths and remain visible.
 */
function createFilteredLogger() {
  const logger = createLogger()
  const original = logger.error.bind(logger)
  logger.error = (msg, options) => {
    if (typeof msg === 'string' && msg.includes('ws proxy socket error')) {
      const code = (options?.error as NodeJS.ErrnoException | undefined)?.code
      if (code === 'EPIPE' || code === 'ECONNRESET') return
    }
    original(msg, options)
  }
  return logger
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  customLogger: createFilteredLogger(),
  build: {
    outDir: 'dist/client',
    target: 'es2022',
  },
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${serverPort}`,
      '/auth': `http://127.0.0.1:${serverPort}`,
      '/socket.io': {
        target: `http://127.0.0.1:${serverPort}`,
        ws: true,
      },
    },
  },
})
