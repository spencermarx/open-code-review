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
import { childEnv } from '../child-env.js'
import {
  loadTeamConfig,
  resolveTeamComposition,
  type ReviewerInstance,
} from '@open-code-review/config/team-config'
import {
  detectActiveVendor,
  isModelVendor,
  listModelsForVendor,
  SUPPORTED_VENDORS,
  type ModelVendor,
} from '@open-code-review/config/models'
import { execBinary, type ExecError } from '@open-code-review/platform'
import { dirname } from 'node:path'

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
    // in one canonical place. execBinary (not a raw spawnSync): `ocr` is an
    // npm .cmd shim on Windows, where a shell-less raw spawn ENOENTs — this
    // route was broken there until issue #43's sweep. execBinary throws on
    // any failure with status/stderr attached.
    try {
      execBinary('ocr', ['team', 'set', '--stdin'], {
        input: JSON.stringify(body.team),
        // Shell-parity env from the frozen launch snapshot — an `ocr` child
        // is a node process; ambient NODE_OPTIONS/OCR_* must not reach it.
        env: childEnv().env,
        encoding: 'utf-8',
        // Run from the project root (parent of `.ocr`). `dirname` is
        // separator-correct on every platform — a prior `/\/\.ocr$/` regex
        // silently no-op'd on Windows (join builds the path with `\`), running
        // `ocr team set` inside the `.ocr` dir itself (blocker B2). Matches the
        // `dirname(ocrDir)` derivation used across the socket handlers.
        cwd: dirname(ocrDir),
        timeout: 10000,
      })
      res.json({ ok: true, team: body.team })
    } catch (err) {
      console.error('Failed to persist team:', err)
      const e = err as ExecError
      res.status(500).json({
        error: 'Failed to persist team',
        detail: err instanceof Error ? err.message : String(err),
        ...(typeof e.stderr === 'string' && e.stderr ? { stderr: e.stderr } : {}),
      })
    }
  })

  // Vendor support derives from the CLI strategy table — the single source
  // of truth for model enumeration. Enumeration is async so a slow vendor
  // probe never blocks the dashboard's event loop (the lib caches
  // enumeration results; `vendor=auto` detection probes fresh each call).
  //
  // The async body is wrapped in a SINGLE try/catch covering everything —
  // including query parsing. Express 4 does not catch async throws, so any
  // statement outside the try would become a swallowed unhandled rejection
  // and a permanently hung request. This is the template for async routes.
  router.get('/models', (req, res) => {
    void (async () => {
      try {
        const raw = req.query['vendor']
        if (raw !== undefined && typeof raw !== 'string') {
          // Array/object query forms (?vendor=a&vendor=b) are malformed input.
          res.status(400).json({ error: 'vendor must be a single string' })
          return
        }
        const requested = raw?.toLowerCase()

        let vendor: ModelVendor | null
        if (requested && isModelVendor(requested)) {
          vendor = requested
        } else if (!requested || requested === 'auto') {
          vendor = await detectActiveVendor()
        } else {
          res.status(400).json({
            error: `Unknown vendor: ${requested}. Supported: ${SUPPORTED_VENDORS.join(', ')}`,
          })
          return
        }

        if (!vendor) {
          res.json({ vendor: null, source: null, models: [] })
          return
        }

        const result = await listModelsForVendor(vendor)
        res.json(result)
      } catch (err) {
        console.error('Failed to list models:', err)
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to list models',
            detail: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })()
  })

  return router
}
