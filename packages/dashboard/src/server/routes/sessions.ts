/**
 * Session CRUD endpoints.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import { getAllSessions, getSession, getEventsForSession } from '../db.js'

export function createSessionsRouter(db: Database): Router {
  const router = Router()

  // GET /api/sessions — List all sessions, sorted by updated_at desc
  router.get('/', (_req, res) => {
    try {
      const sessions = getAllSessions(db)
      res.json(sessions)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch sessions', detail: String(err) })
    }
  })

  // GET /api/sessions/:id — Get single session with detail
  router.get('/:id', (req, res) => {
    try {
      const session = getSession(db, req.params['id'] as string)
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      res.json(session)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch session', detail: String(err) })
    }
  })

  // GET /api/sessions/:id/events — Get orchestration events for session
  router.get('/:id/events', (req, res) => {
    try {
      const session = getSession(db, req.params['id'] as string)
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      const events = getEventsForSession(db, req.params['id'] as string)
      res.json(events)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch events', detail: String(err) })
    }
  })

  return router
}
