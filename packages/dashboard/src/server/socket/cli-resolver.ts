/**
 * CLI resolution utility.
 *
 * Resolves the path to the local OCR CLI entry point so the dashboard
 * can spawn commands using the correct (possibly monorepo-local) version.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the CLI entry point so dashboard commands run the correct version.
 *
 * Strategy (checked in order):
 * 1. Monorepo development — walk up from this source file to find
 *    packages/cli/dist/index.js at the workspace root.
 * 2. Production bundle — the dashboard server is bundled inside the CLI
 *    package at dist/dashboard/server.js, with the CLI entry at dist/index.js
 *    (one directory up).
 * 3. Fall back to `ocr` on PATH (null return).
 */
export function resolveLocalCli(): string | null {
  // 1. Monorepo: walk up to find packages/cli/dist/index.js
  let dir = __dirname
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'packages', 'cli', 'dist', 'index.js')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }

  // 2. Production: dist/dashboard/server.js → dist/index.js
  const parentDir = join(__dirname, '..')
  const bundledCli = join(parentDir, 'index.js')
  if (existsSync(bundledCli) && existsSync(join(parentDir, 'package.json'))) {
    return bundledCli
  }

  return null
}
