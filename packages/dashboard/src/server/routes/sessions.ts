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
      console.error('Failed to fetch sessions:', err)
      res.status(500).json({ error: 'Failed to fetch sessions' })
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
      console.error('Failed to fetch session:', err)
      res.status(500).json({ error: 'Failed to fetch session' })
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
      console.error('Failed to fetch events:', err)
      res.status(500).json({ error: 'Failed to fetch events' })
    }
  })

  return router
}
