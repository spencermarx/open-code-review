/**
 * User progress mutation endpoints for files and findings.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import {
  getMapFile,
  getFinding,
  upsertFileProgress,
  deleteFileProgress,
  upsertFindingProgress,
  deleteFindingProgress,
  getFileProgress,
  getFindingProgress,
  getRoundById,
  getRoundProgress,
  upsertRoundProgress,
  deleteRoundProgress,
  saveDb,
  type FindingProgressRow,
  type RoundProgressRow,
} from '../db.js'

const VALID_FINDING_STATUSES = new Set<FindingProgressRow['status']>([
  'unread',
  'read',
  'acknowledged',
  'fixed',
  'wont_fix',
])

const VALID_ROUND_STATUSES = new Set<RoundProgressRow['status']>([
  'needs_review',
  'in_progress',
  'changes_made',
  'acknowledged',
  'dismissed',
])

// ── Debounced save ──

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingDb: Database | null = null
let pendingOcrDir: string | null = null

function debouncedSave(db: Database, ocrDir: string): void {
  pendingDb = db
  pendingOcrDir = ocrDir
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (pendingDb && pendingOcrDir) {
      saveDb(pendingDb, pendingOcrDir)
    }
    saveTimer = null
    pendingDb = null
    pendingOcrDir = null
  }, 500)
}

/**
 * Flush any pending debounced save immediately.
 * Call this on server shutdown to ensure no writes are lost.
 */
export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (pendingDb && pendingOcrDir) {
    saveDb(pendingDb, pendingOcrDir)
    pendingDb = null
    pendingOcrDir = null
  }
}

export function createProgressRouter(db: Database, ocrDir: string): Router {
  const router = Router()

  // PATCH /api/map-files/:id/progress — Toggle file review status
  router.patch('/map-files/:id/progress', (req, res) => {
    try {
      const fileId = parseInt(req.params['id'] as string, 10)
      if (isNaN(fileId)) {
        res.status(400).json({ error: 'Invalid file ID' })
        return
      }

      const file = getMapFile(db, fileId)
      if (!file) {
        res.status(404).json({ error: 'Map file not found' })
        return
      }

      const isReviewed = req.body?.is_reviewed as boolean | undefined
      if (typeof isReviewed !== 'boolean') {
        res.status(400).json({ error: 'is_reviewed must be a boolean' })
        return
      }

      upsertFileProgress(db, fileId, isReviewed)
      debouncedSave(db, ocrDir)

      const progress = getFileProgress(db, fileId)
      res.json(progress)
    } catch (err) {
      console.error('Failed to update file progress:', err)
      res.status(500).json({ error: 'Failed to update file progress' })
    }
  })

  // DELETE /api/map-files/:id/progress — Clear file progress
  router.delete('/map-files/:id/progress', (req, res) => {
    try {
      const fileId = parseInt(req.params['id'] as string, 10)
      if (isNaN(fileId)) {
        res.status(400).json({ error: 'Invalid file ID' })
        return
      }

      deleteFileProgress(db, fileId)
      debouncedSave(db, ocrDir)
      res.status(200).json({ deleted: true })
    } catch (err) {
      console.error('Failed to clear file progress:', err)
      res.status(500).json({ error: 'Failed to clear file progress' })
    }
  })

  // PATCH /api/findings/:id/progress — Update finding triage status
  router.patch('/findings/:id/progress', (req, res) => {
    try {
      const findingId = parseInt(req.params['id'] as string, 10)
      if (isNaN(findingId)) {
        res.status(400).json({ error: 'Invalid finding ID' })
        return
      }

      const finding = getFinding(db, findingId)
      if (!finding) {
        res.status(404).json({ error: 'Finding not found' })
        return
      }

      const status = req.body?.status as string | undefined
      if (!status || !VALID_FINDING_STATUSES.has(status as FindingProgressRow['status'])) {
        res.status(400).json({
          error: 'Invalid status',
          valid_statuses: [...VALID_FINDING_STATUSES],
        })
        return
      }

      upsertFindingProgress(db, findingId, status as FindingProgressRow['status'])
      debouncedSave(db, ocrDir)

      const progress = getFindingProgress(db, findingId)
      res.json(progress)
    } catch (err) {
      console.error('Failed to update finding progress:', err)
      res.status(500).json({ error: 'Failed to update finding progress' })
    }
  })

  // DELETE /api/findings/:id/progress — Clear finding progress
  router.delete('/findings/:id/progress', (req, res) => {
    try {
      const findingId = parseInt(req.params['id'] as string, 10)
      if (isNaN(findingId)) {
        res.status(400).json({ error: 'Invalid finding ID' })
        return
      }

      deleteFindingProgress(db, findingId)
      debouncedSave(db, ocrDir)
      res.status(200).json({ deleted: true })
    } catch (err) {
      console.error('Failed to clear finding progress:', err)
      res.status(500).json({ error: 'Failed to clear finding progress' })
    }
  })

  // PATCH /api/rounds/:id/progress — Update round triage status
  router.patch('/rounds/:id/progress', (req, res) => {
    try {
      const roundId = parseInt(req.params['id'] as string, 10)
      if (isNaN(roundId)) {
        res.status(400).json({ error: 'Invalid round ID' })
        return
      }

      const round = getRoundById(db, roundId)
      if (!round) {
        res.status(404).json({ error: 'Round not found' })
        return
      }

      const status = req.body?.status as string | undefined
      if (!status || !VALID_ROUND_STATUSES.has(status as RoundProgressRow['status'])) {
        res.status(400).json({
          error: 'Invalid status',
          valid_statuses: [...VALID_ROUND_STATUSES],
        })
        return
      }

      upsertRoundProgress(db, roundId, status as RoundProgressRow['status'])
      debouncedSave(db, ocrDir)

      const progress = getRoundProgress(db, roundId)
      res.json(progress)
    } catch (err) {
      console.error('Failed to update round progress:', err)
      res.status(500).json({ error: 'Failed to update round progress' })
    }
  })

  // DELETE /api/rounds/:id/progress — Clear round progress
  router.delete('/rounds/:id/progress', (req, res) => {
    try {
      const roundId = parseInt(req.params['id'] as string, 10)
      if (isNaN(roundId)) {
        res.status(400).json({ error: 'Invalid round ID' })
        return
      }

      deleteRoundProgress(db, roundId)
      debouncedSave(db, ocrDir)
      res.status(200).json({ deleted: true })
    } catch (err) {
      console.error('Failed to clear round progress:', err)
      res.status(500).json({ error: 'Failed to clear round progress' })
    }
  })

  return router
}
