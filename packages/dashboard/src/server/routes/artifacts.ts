/**
 * Markdown artifact content endpoints.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import { getSession, getArtifact } from '../db.js'

const VALID_ARTIFACT_TYPES = new Set([
  'context',
  'discovered-standards',
  'discourse',
  'final',
  'map',
  'flow-analysis',
  'topology',
  'requirements-mapping',
])

export function createArtifactsRouter(db: Database): Router {
  const router = Router()

  // GET /api/sessions/:id/artifacts/:type — Get markdown artifact content
  router.get('/:id/artifacts/:type', (req, res) => {
    try {
      const sessionId = req.params['id'] as string
      const artifactType = req.params['type'] as string

      if (!VALID_ARTIFACT_TYPES.has(artifactType)) {
        res.status(400).json({
          error: 'Invalid artifact type',
          valid_types: [...VALID_ARTIFACT_TYPES],
        })
        return
      }

      const session = getSession(db, sessionId)
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }

      const artifact = getArtifact(db, sessionId, artifactType)
      if (!artifact) {
        res.status(404).json({ error: 'Artifact not found' })
        return
      }

      res.json(artifact)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch artifact', detail: String(err) })
    }
  })

  return router
}
