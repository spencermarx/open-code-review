/**
 * Terminal handoff endpoint — backs the dashboard's "Pick up in terminal"
 * panel. Returns a fully-built command pair the user can paste into their
 * shell to either resume the OCR review (default) or drop directly into
 * the underlying CLI's own resume primitive (advanced bypass).
 *
 * Both command strings are built server-side so the client never has to
 * reconstruct vendor-specific syntax.
 */

import { Router } from 'express'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import type { Database } from 'sql.js'
import {
  getLatestAgentSessionWithVendorId,
  getSession,
} from '@open-code-review/cli/db'

export type SyncFromDisk = () => void

type HandoffPayload = {
  workflow_id: string
  vendor: string | null
  vendor_session_id: string | null
  project_dir: string
  host_binary_available: boolean
  ocr_command: string
  vendor_command: string | null
  fallback: 'fresh-start' | null
}

const VENDOR_BINARIES: Record<string, string> = {
  claude: 'claude',
  opencode: 'opencode',
}

function probeBinary(binary: string): boolean {
  try {
    const probe = spawnSync(binary, ['--version'], {
      stdio: 'ignore',
      timeout: 3000,
    })
    return probe.status === 0
  } catch {
    return false
  }
}

function buildVendorResumeCommand(vendor: string, vendorSessionId: string): string {
  if (vendor === 'claude') {
    return `claude --resume ${vendorSessionId}`
  }
  if (vendor === 'opencode') {
    return `opencode run "" --session ${vendorSessionId} --continue`
  }
  // Unknown vendor — return a placeholder; UI will warn.
  return `# Unknown vendor "${vendor}" — refer to your CLI's resume documentation`
}

export function createHandoffRouter(
  db: Database,
  ocrDir: string,
  syncFromDisk: SyncFromDisk = () => {},
): Router {
  const router = Router()

  router.get('/:id/handoff', (req, res) => {
    const workflowId = req.params['id'] as string | undefined
    if (!workflowId) {
      res.status(400).json({ error: 'workflow id is required' })
      return
    }
    try {
      syncFromDisk()
      const session = getSession(db, workflowId)
      if (!session) {
        res.status(404).json({ error: 'workflow not found' })
        return
      }

      const projectDir = dirname(ocrDir)
      const latest = getLatestAgentSessionWithVendorId(db, workflowId)

      // No vendor id captured yet — surface the start-fresh fallback.
      if (!latest || !latest.vendor_session_id) {
        const payload: HandoffPayload = {
          workflow_id: workflowId,
          vendor: latest?.vendor ?? null,
          vendor_session_id: null,
          project_dir: projectDir,
          host_binary_available: false,
          ocr_command: `cd ${projectDir} && ocr review --branch ${session.branch}`,
          vendor_command: null,
          fallback: 'fresh-start',
        }
        res.json(payload)
        return
      }

      const binary = VENDOR_BINARIES[latest.vendor] ?? latest.vendor
      const hostBinaryAvailable = probeBinary(binary)

      const ocrCommand = `cd ${projectDir} && ocr review --resume ${workflowId}`
      const vendorCommand = buildVendorResumeCommand(latest.vendor, latest.vendor_session_id)

      const payload: HandoffPayload = {
        workflow_id: workflowId,
        vendor: latest.vendor,
        vendor_session_id: latest.vendor_session_id,
        project_dir: projectDir,
        host_binary_available: hostBinaryAvailable,
        ocr_command: ocrCommand,
        vendor_command: vendorCommand,
        fallback: null,
      }
      res.json(payload)
    } catch (err) {
      console.error('Failed to build handoff payload:', err)
      res.status(500).json({ error: 'Failed to build handoff payload' })
    }
  })

  return router
}
