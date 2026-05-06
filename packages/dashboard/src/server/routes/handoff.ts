/**
 * Terminal handoff endpoint — backs the dashboard's "Pick up in terminal"
 * panel. Returns a structured `ResumeOutcome` discriminated union: either
 * a `resumable` outcome with copyable command strings, or an `unresumable`
 * outcome with a typed reason + diagnostics.
 *
 * All capture/resume logic lives in the `SessionCaptureService`; this
 * route is a thin delegate. Per the
 * `add-self-diagnosing-resume-handoff` proposal, no SQL is executed
 * directly here.
 */
import { dirname } from 'node:path'
import { Router } from 'express'
import type {
  ResumeOutcome,
  SessionCaptureService,
} from '../services/capture/session-capture-service.js'

export type SyncFromDisk = () => void

export type HandoffPayload = {
  workflow_id: string
  /**
   * Project root the resume command should `cd` into. Identical
   * regardless of outcome.kind, so it lives on the envelope rather
   * than being duplicated on both arms of the union (round-3
   * Suggestion 4 — discriminated unions should discriminate, not
   * carry shared operational context).
   */
  projectDir: string
  outcome: ResumeOutcome
}

export function createHandoffRouter(
  sessionCapture: SessionCaptureService,
  ocrDir: string,
  syncFromDisk: SyncFromDisk = () => {},
): Router {
  const router = Router()
  const projectDir = dirname(ocrDir)

  router.get('/:id/handoff', (req, res) => {
    const workflowId = req.params['id'] as string | undefined
    if (!workflowId) {
      res.status(400).json({ error: 'workflow id is required' })
      return
    }
    try {
      syncFromDisk()
      const outcome = sessionCapture.resolveResumeContext(workflowId)
      const payload: HandoffPayload = {
        workflow_id: workflowId,
        projectDir,
        outcome,
      }
      res.json(payload)
    } catch (err) {
      console.error('Failed to build handoff payload:', err)
      res.status(500).json({ error: 'Failed to build handoff payload' })
    }
  })

  return router
}
