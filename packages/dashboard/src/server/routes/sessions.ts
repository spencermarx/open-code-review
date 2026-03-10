/**
 * Session CRUD endpoints.
 *
 * Enriches raw `SessionRow` objects with per-workflow progress derived
 * from artifact tables (review_rounds, map_runs, markdown_artifacts).
 * This lets the client render independent progress for review and map
 * workflows without requiring CLI schema changes.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import {
  type SessionRow,
  getAllSessions,
  getSession,
  getEventsForSession,
  getRoundsForSession,
  getMapRunsForSession,
  getArtifact,
  getReviewerOutputsForRound,
  getRoundProgress,
} from '../db.js'

// Phase names must match session-detail-page.tsx constants
const REVIEW_PHASE_NAMES = [
  'context',
  'change-context',
  'analysis',
  'reviews',
  'aggregation',
  'discourse',
  'synthesis',
  'complete',
]

const MAP_PHASE_NAMES = [
  'map-context',
  'topology',
  'flow-analysis',
  'requirements-mapping',
  'synthesis',
  'complete',
]

// ── Enrichment ──

type EnrichedSession = SessionRow & {
  has_review: boolean
  has_map: boolean
  review_phase_number: number
  review_phase: string
  map_phase_number: number
  map_phase: string
  latest_verdict: string | null
  latest_blocker_count: number
  latest_round_status: string | null
}

/**
 * Derive the review workflow's phase number from artifact presence.
 */
function deriveReviewPhase(db: Database, sessionId: string): number {
  const rounds = getRoundsForSession(db, sessionId)
  if (rounds.length === 0) {
    // No rounds, check if context artifacts exist (review was started but no round yet)
    const context = getArtifact(db, sessionId, 'context')
    if (context) return 3 // analysis
    const standards = getArtifact(db, sessionId, 'discovered-standards')
    if (standards) return 2 // change-context
    return 1 // context
  }

  const latestRound = rounds[rounds.length - 1]!
  if (latestRound.final_md_path) return 8 // complete
  const discourse = getArtifact(db, sessionId, 'discourse')
  if (discourse) return 7 // synthesis
  const outputs = getReviewerOutputsForRound(db, latestRound.id)
  if (outputs.length > 0) return 4 // reviews
  const context = getArtifact(db, sessionId, 'context')
  if (context) return 3 // analysis
  const standards = getArtifact(db, sessionId, 'discovered-standards')
  if (standards) return 2 // change-context
  return 1
}

/**
 * Derive the map workflow's phase number from artifact presence.
 */
function deriveMapPhase(db: Database, sessionId: string): number {
  const runs = getMapRunsForSession(db, sessionId)
  if (runs.length === 0) {
    const standards = getArtifact(db, sessionId, 'discovered-standards')
    if (standards) return 2 // topology
    return 1 // map-context
  }

  const latestRun = runs[runs.length - 1]!
  if (latestRun.map_md_path) return 6 // complete
  const reqMapping = getArtifact(db, sessionId, 'requirements-mapping')
  if (reqMapping) return 5 // synthesis
  const flow = getArtifact(db, sessionId, 'flow-analysis')
  if (flow) return 4 // requirements-mapping
  const topo = getArtifact(db, sessionId, 'topology')
  if (topo) return 3 // flow-analysis
  const standards = getArtifact(db, sessionId, 'discovered-standards')
  if (standards) return 2 // topology
  return 1
}

function enrichSession(db: Database, session: SessionRow): EnrichedSession {
  const rounds = getRoundsForSession(db, session.id)
  const mapRuns = getMapRunsForSession(db, session.id)

  const hasReview = session.workflow_type === 'review' || session.current_round > 0 || rounds.length > 0
  const hasMap = session.workflow_type === 'map' || session.current_map_run > 1 || mapRuns.length > 0

  // Use the higher of the CLI's authoritative phase_number and the artifact-derived
  // phase. The CLI may be ahead (mid-transition) or behind (crashed, pre-orchestrator
  // sessions, imported sessions). Taking the max handles both cases correctly.
  let reviewPhaseNumber = 0
  let reviewPhase = ''
  if (hasReview) {
    const derived = deriveReviewPhase(db, session.id)
    if (session.workflow_type === 'review') {
      reviewPhaseNumber = Math.max(session.phase_number, derived)
    } else {
      reviewPhaseNumber = derived
    }
    reviewPhase = REVIEW_PHASE_NAMES[reviewPhaseNumber - 1] ?? 'context'
  }

  let mapPhaseNumber = 0
  let mapPhase = ''
  if (hasMap) {
    const derived = deriveMapPhase(db, session.id)
    if (session.workflow_type === 'map') {
      mapPhaseNumber = Math.max(session.phase_number, derived)
    } else {
      mapPhaseNumber = derived
    }
    mapPhase = MAP_PHASE_NAMES[mapPhaseNumber - 1] ?? 'map-context'
  }

  // Latest review verdict from the most recent completed round
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1]! : null
  const latestVerdict = latestRound?.verdict ?? null
  const latestBlockerCount = latestRound?.blocker_count ?? 0
  const latestRoundProgress = latestRound ? getRoundProgress(db, latestRound.id) : undefined
  const latestRoundStatus = latestRoundProgress?.status ?? null

  return {
    ...session,
    has_review: hasReview,
    has_map: hasMap,
    review_phase_number: reviewPhaseNumber,
    review_phase: reviewPhase,
    map_phase_number: mapPhaseNumber,
    map_phase: mapPhase,
    latest_verdict: latestVerdict,
    latest_blocker_count: latestBlockerCount,
    latest_round_status: latestRoundStatus,
  }
}

// ── Router ──

export function createSessionsRouter(db: Database): Router {
  const router = Router()

  // GET /api/sessions — List all sessions, sorted by updated_at desc
  router.get('/', (_req, res) => {
    try {
      const sessions = getAllSessions(db)
      res.json(sessions.map((s) => enrichSession(db, s)))
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
      res.json(enrichSession(db, session))
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
