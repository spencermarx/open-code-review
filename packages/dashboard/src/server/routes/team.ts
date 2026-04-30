/**
 * Team configuration endpoints — back the dashboard's Team Composition Panel.
 *
 * GET /api/team/resolved → resolved ReviewerInstance[] for the workspace,
 *                          optionally with a session-time override applied
 * POST /api/team/default → persist a new default_team via `ocr team set`
 *
 * The dashboard never parses YAML directly. All reads and writes go through
 * the same shared `team-config` parser the CLI uses, so the dashboard and
 * AI workflow always see identical resolved compositions.
 */

import { Router } from 'express'
import { spawnSync } from 'node:child_process'
import {
  loadTeamConfig,
  resolveTeamComposition,
  type ReviewerInstance,
} from '@open-code-review/cli/team-config'
import {
  detectActiveVendor,
  listModelsForVendor,
  type ModelVendor,
} from '@open-code-review/cli/models'

function isReviewerInstanceArray(input: unknown): input is ReviewerInstance[] {
  if (!Array.isArray(input)) return false
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') return false
    const obj = entry as Record<string, unknown>
    if (typeof obj['persona'] !== 'string') return false
    if (typeof obj['instance_index'] !== 'number') return false
    if (typeof obj['name'] !== 'string') return false
    if (obj['model'] !== null && typeof obj['model'] !== 'string') return false
  }
  return true
}

export function createTeamRouter(ocrDir: string): Router {
  const router = Router()

  router.get('/resolved', (req, res) => {
    try {
      const { team } = loadTeamConfig(ocrDir)

      const overrideRaw = req.query['override']
      let override: ReviewerInstance[] | undefined
      if (typeof overrideRaw === 'string' && overrideRaw.length > 0) {
        try {
          const parsed: unknown = JSON.parse(overrideRaw)
          if (!isReviewerInstanceArray(parsed)) {
            res.status(400).json({ error: 'override must be a ReviewerInstance[]' })
            return
          }
          override = parsed
        } catch (err) {
          res.status(400).json({
            error: 'override is not valid JSON',
            detail: err instanceof Error ? err.message : String(err),
          })
          return
        }
      }

      const resolved = resolveTeamComposition(team, override)
      res.json({ team: resolved })
    } catch (err) {
      console.error('Failed to resolve team:', err)
      res.status(500).json({
        error: 'Failed to resolve team',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  })

  router.post('/default', (req, res) => {
    const body = req.body as { team?: unknown } | undefined
    if (!body || !isReviewerInstanceArray(body.team)) {
      res.status(400).json({ error: 'request body must be { team: ReviewerInstance[] }' })
      return
    }

    // Pipe the team JSON to `ocr team set --stdin`. We shell out (rather than
    // calling team-config functions directly) so the YAML round-trip happens
    // in one canonical place.
    try {
      const result = spawnSync('ocr', ['team', 'set', '--stdin'], {
        input: JSON.stringify(body.team),
        encoding: 'utf-8',
        cwd: ocrDir.replace(/\/\.ocr$/, ''),
        timeout: 10000,
      })

      if (result.error) {
        res.status(500).json({
          error: 'Failed to invoke ocr team set',
          detail: result.error.message,
        })
        return
      }
      if (result.status !== 0) {
        res.status(500).json({
          error: 'ocr team set exited non-zero',
          stderr: result.stderr,
        })
        return
      }

      res.json({ ok: true, team: body.team })
    } catch (err) {
      console.error('Failed to persist team:', err)
      res.status(500).json({
        error: 'Failed to persist team',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  })

  router.get('/models', (req, res) => {
    let vendor: ModelVendor | null
    const requested = (req.query['vendor'] as string | undefined)?.toLowerCase()
    if (requested === 'claude' || requested === 'opencode') {
      vendor = requested
    } else if (!requested || requested === 'auto') {
      vendor = detectActiveVendor()
    } else {
      res.status(400).json({ error: `Unknown vendor: ${requested}` })
      return
    }

    if (!vendor) {
      res.json({ vendor: null, source: null, models: [] })
      return
    }

    try {
      const result = listModelsForVendor(vendor)
      res.json(result)
    } catch (err) {
      console.error('Failed to list models:', err)
      res.status(500).json({
        error: 'Failed to list models',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return router
}
