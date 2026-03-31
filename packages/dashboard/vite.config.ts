import { defineConfig } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Discover the server port. Priority:
 * 1. PORT env var (explicit override)
 * 2. `.ocr/data/server-port` file (written by the server on startup)
 * 3. Default 4173
 *
 * Walks up from CWD to find `.ocr/` — Vite runs from packages/dashboard/
 * but `.ocr/` lives at the monorepo root.
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

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
