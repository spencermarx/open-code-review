import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Workspace: resolve CLI subpath exports to source TypeScript files.
      // The published package uses dist/ via conditional exports, but in the
      // monorepo vitest needs the source files directly.
      '@open-code-review/cli/db': resolve(__dirname, '../cli/src/lib/db/index.ts'),
    },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
