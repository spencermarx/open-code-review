/**
 * Aggregate statistics endpoint.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import { getStats } from '../db.js'

export function createStatsRouter(db: Database): Router {
  const router = Router()

  // GET /api/stats — Aggregate stats (camelCase for client consumption)
  router.get('/', (_req, res) => {
    try {
      const stats = getStats(db)
      res.json({
        totalSessions: stats.total_sessions,
        activeSessions: stats.active_sessions,
        completedReviews: stats.completed_reviews,
        completedMaps: stats.total_map_runs,
        filesTracked: stats.total_files_tracked,
        unresolvedBlockers: stats.unresolved_blockers,
      })
    } catch (err) {
      console.error('Failed to fetch stats:', err)
      res.status(500).json({ error: 'Failed to fetch stats' })
    }
  })

  return router
}
