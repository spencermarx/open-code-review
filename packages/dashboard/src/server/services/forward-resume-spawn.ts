/**
 * The forward-resume sweep's spawn primitive, extracted from `startServer`
 * so the one spec scenario dedicated to this site ("Forward-resume spawn
 * uses the builder") is pinned by a unit test and the module sits inside
 * the child-env lint gates — `server/index.ts` itself cannot join the
 * `process.env` ban (it legitimately reads server config), which made this
 * spawn the only builder-converged site guarded by nothing but a comment.
 */

import { dirname } from 'node:path'
import { spawnBinary } from '@open-code-review/platform'
import { childEnv } from '../child-env.js'

/**
 * Build the sweep's `spawnResume` callback. Detached, fire-and-forget: the
 * CLI command re-checks liveness + acquires the single-writer lease, so a
 * duplicate trigger cannot double-drive.
 */
export function makeSpawnResume(ocrDir: string): (sessionId: string) => void {
  return (sessionId: string): void => {
    const child = spawnBinary('ocr', ['review', '--resume', sessionId], {
      cwd: dirname(ocrDir),
      // Same builder as every other spawn path — without this the sweep
      // child inherited the dashboard's full mutated env (NODE_ENV=
      // production and any ambient OCR_*), diverging from adapter spawns.
      env: childEnv().env,
      stdio: 'ignore',
      detached: true,
    })
    child.on('error', (err) => {
      console.error(`[ForwardResume] spawn failed for ${sessionId}:`, err.message)
    })
    child.unref()
  }
}
