/**
 * Review rounds, findings, and reviewer output endpoints.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import {
  getSession,
  getAllRounds,
  getRoundsForSession,
  getRound,
  getReviewerOutputsForRound,
  getReviewerOutput,
  getFindingsForRound,
  getFindingsForReviewerOutput,
  getFindingProgress,
  getRoundProgress,
  type FindingRow,
} from '../db.js'

function enrichFindingsWithProgress(db: Database, findings: FindingRow[]) {
  return findings.map((f) => {
    const progress = getFindingProgress(db, f.id)
    return { ...f, progress: progress ?? null }
  })
}

export function createReviewsRouter(db: Database): Router {
  const router = Router()

  // GET /api/sessions/:id/rounds — List review rounds for session
  router.get('/:id/rounds', (req, res) => {
    try {
      const session = getSession(db, req.params['id'] as string)
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      const rounds = getRoundsForSession(db, req.params['id'] as string)
      const enriched = rounds.map((r) => ({
        ...r,
        progress: getRoundProgress(db, r.id) ?? null,
      }))
      res.json(enriched)
    } catch (err) {
      console.error('Failed to fetch rounds:', err)
      res.status(500).json({ error: 'Failed to fetch rounds' })
    }
  })

  // GET /api/sessions/:id/rounds/:round — Get round detail with reviewer outputs
  router.get('/:id/rounds/:round', (req, res) => {
    try {
      const roundNumber = parseInt(req.params['round'] as string, 10)
      if (isNaN(roundNumber)) {
        res.status(400).json({ error: 'Invalid round number' })
        return
      }
      const round = getRound(db, req.params['id'] as string, roundNumber)
      if (!round) {
        res.status(404).json({ error: 'Round not found' })
        return
      }
      const reviewerOutputs = getReviewerOutputsForRound(db, round.id)
      res.json({ ...round, reviewer_outputs: reviewerOutputs, progress: getRoundProgress(db, round.id) ?? null })
    } catch (err) {
      console.error('Failed to fetch round:', err)
      res.status(500).json({ error: 'Failed to fetch round' })
    }
  })

  // GET /api/sessions/:id/rounds/:round/findings — Get findings for round
  router.get('/:id/rounds/:round/findings', (req, res) => {
    try {
      const roundNumber = parseInt(req.params['round'] as string, 10)
      if (isNaN(roundNumber)) {
        res.status(400).json({ error: 'Invalid round number' })
        return
      }
      const round = getRound(db, req.params['id'] as string, roundNumber)
      if (!round) {
        res.status(404).json({ error: 'Round not found' })
        return
      }
      const findings = getFindingsForRound(db, round.id)
      res.json(enrichFindingsWithProgress(db, findings))
    } catch (err) {
      console.error('Failed to fetch findings:', err)
      res.status(500).json({ error: 'Failed to fetch findings' })
    }
  })

  // GET /api/sessions/:id/rounds/:round/reviewers/:reviewerId — Get reviewer output detail
  router.get('/:id/rounds/:round/reviewers/:reviewerId', (req, res) => {
    try {
      const roundNumber = parseInt(req.params['round'] as string, 10)
      const reviewerId = parseInt(req.params['reviewerId'] as string, 10)
      if (isNaN(roundNumber) || isNaN(reviewerId)) {
        res.status(400).json({ error: 'Invalid round number or reviewer ID' })
        return
      }
      const round = getRound(db, req.params['id'] as string, roundNumber)
      if (!round) {
        res.status(404).json({ error: 'Round not found' })
        return
      }
      const output = getReviewerOutput(db, round.id, reviewerId)
      if (!output) {
        res.status(404).json({ error: 'Reviewer output not found' })
        return
      }
      const findings = getFindingsForReviewerOutput(db, output.id)
      res.json({ ...output, findings: enrichFindingsWithProgress(db, findings) })
    } catch (err) {
      console.error('Failed to fetch reviewer output:', err)
      res.status(500).json({ error: 'Failed to fetch reviewer output' })
    }
  })

  return router
}
