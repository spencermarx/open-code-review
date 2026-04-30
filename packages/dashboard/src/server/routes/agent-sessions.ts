/**
 * Agent sessions endpoint — surfaces the per-instance lifecycle journal.
 *
 * Backs the dashboard's session-detail liveness header. Returns the rows
 * that the AI's `ocr session start-instance` / `bind-vendor-id` / `beat` /
 * `end-instance` calls have written for a given workflow.
 */

import { Router } from 'express'
import type { Server as SocketIOServer } from 'socket.io'
import type { Database } from 'sql.js'
import { listAgentSessionsForWorkflow } from '@open-code-review/cli/db'

/**
 * Pull-on-read sync hook. The route invokes this before each read so the
 * caller observes the freshest disk state regardless of watcher debounce
 * or platform timing quirks. Cost: one disk read + sql.js parse per
 * request, ~ms scale on a workstation. The watcher remains as the
 * push-based path for socket.io invalidation events.
 */
export type SyncFromDisk = () => void

export function createAgentSessionsRouter(
  db: Database,
  syncFromDisk: SyncFromDisk = () => {},
): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const workflowId = (req.query['workflow'] as string | undefined) ?? ''
    if (!workflowId) {
      res.status(400).json({ error: 'workflow query parameter is required' })
      return
    }
    try {
      syncFromDisk()
      const rows = listAgentSessionsForWorkflow(db, workflowId)
      res.json({ workflow_id: workflowId, agent_sessions: rows })
    } catch (err) {
      console.error('Failed to list agent sessions:', err)
      res.status(500).json({ error: 'Failed to list agent sessions' })
    }
  })

  return router
}

/**
 * Emits an `agent_session:updated` Socket.IO event whenever the
 * `agent_sessions` table is touched on disk (CLI process writes via
 * `ocr session start-instance`/`beat`/`end-instance`, sweep
 * reclassifications, command-runner vendor-id binds).
 *
 * Wired via the existing DbSyncWatcher hook in `dashboard/src/server/db.ts`
 * — this helper is the public surface for the wiring site to call.
 */
export function emitAgentSessionsUpdated(
  io: SocketIOServer,
  workflowIds: string[],
): void {
  const payload = { workflow_ids: Array.from(new Set(workflowIds)) }
  io.emit('agent_session:updated', payload)
}
