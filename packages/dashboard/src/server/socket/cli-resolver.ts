/**
 * CLI resolution utility.
 *
 * Resolves the path to the local OCR CLI entry point so the dashboard
 * can spawn commands using the correct (possibly monorepo-local) version.
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the CLI entry point so dashboard commands run the correct version.
 *
 * Strategy (checked in order):
 * 1. Production bundle — the dashboard server is bundled inside the CLI
 *    package at dist/dashboard/server.js, with the CLI entry at dist/index.js
 *    (one directory up). Checked first because it's an exact structural match.
 * 2. Monorepo development — walk up from this source file to find the
 *    workspace root, then resolve packages/cli/dist/index.js from there.
 *    Uses nx.json as the workspace root marker to avoid false positives from
 *    stale build artifacts in intermediate directories.
 * 3. Fall back to `ocr` on PATH (null return).
 */
export function resolveLocalCli(): string | null {
  // 1. Production: dist/dashboard/server.js → dist/index.js
  //    The parent directory of the server bundle contains the CLI entry point.
  const parentDir = join(__dirname, '..')
  const bundledCli = join(parentDir, 'index.js')
  if (existsSync(bundledCli) && existsSync(join(parentDir, 'dashboard', 'server.js'))) {
    return bundledCli
  }

  // 2. Monorepo: find workspace root (has nx.json), then resolve CLI from there.
  //    Walking up and checking for packages/cli/dist/index.js at every level
  //    can match stale build artifacts in intermediate directories. Instead,
  //    find the workspace root first, then check the canonical path.
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'nx.json'))) {
      const candidate = join(dir, 'packages', 'cli', 'dist', 'index.js')
      if (existsSync(candidate)) return candidate
      break
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return null
}
