/**
 * Resolves the `.ocr/` directory by walking up the filesystem tree.
 */

import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * Walk up from `startDir` looking for a `.ocr/` directory.
 * Throws if not found before reaching the filesystem root.
 */
export function resolveOcrDir(startDir?: string): string {
  let dir = startDir ?? process.cwd()

  while (true) {
    const candidate = join(dir, '.ocr')
    if (existsSync(candidate)) {
      return candidate
    }

    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(
        `Could not find .ocr/ directory starting from ${startDir ?? process.cwd()}`
      )
    }
    dir = parent
  }
}
