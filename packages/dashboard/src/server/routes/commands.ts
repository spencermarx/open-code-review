/**
 * Command execution endpoints.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import { getCommandHistory } from '../db.js'
import { getActiveCommands } from '../socket/command-runner.js'
import { readEventJournal } from '../services/event-journal.js'

type CommandDefinition = {
  name: string
  description: string
  usage: string
  ai?: boolean
}

const AVAILABLE_COMMANDS: CommandDefinition[] = [
  {
    name: 'map',
    description: 'Generate a Code Review Map for large changesets',
    usage: 'ocr map [target] [--fresh] [--requirements <path>]',
    ai: true,
  },
  {
    name: 'review',
    description: 'Run multi-agent AI code review',
    usage: 'ocr review [target] [--fresh] [--requirements <context>]',
    ai: true,
  },
  {
    name: 'progress',
    description: 'View live session progress',
    usage: 'ocr progress',
  },
  {
    name: 'state show',
    description: 'Show current session state',
    usage: 'ocr state show',
  },
  {
    name: 'state sync',
    description: 'Sync filesystem artifacts to database',
    usage: 'ocr state sync',
  },
]

export function createCommandsRouter(db: Database, ocrDir: string): Router {
  const router = Router()

  // GET /api/commands — List available commands with descriptions
  router.get('/', (_req, res) => {
    res.json(AVAILABLE_COMMANDS)
  })

  // GET /api/commands/active — Returns all currently running commands
  router.get('/active', (_req, res) => {
    const commands = getActiveCommands()
    res.json({
      running_count: commands.length,
      commands,
    })
  })

  // GET /api/commands/history — Get command execution history
  // Enriches rows with `duration_ms` computed from started_at / finished_at.
  router.get('/history', (req, res) => {
    try {
      const limit = parseInt(req.query['limit'] as string, 10) || 50
      const history = getCommandHistory(db, limit).map((row) => ({
        ...row,
        duration_ms:
          row.finished_at && row.started_at
            ? new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()
            : null,
      }))
      res.json(history)
    } catch (err) {
      console.error('Failed to fetch command history:', err)
      res.status(500).json({ error: 'Failed to fetch command history' })
    }
  })

  // GET /api/commands/:id/events — Replay the per-execution event stream.
  //
  // Returns the contents of `.ocr/data/events/<id>.jsonl` parsed back into
  // a StreamEvent[]. Used by the client for two paths:
  //   1. Rehydration when a tab reloads mid-run — the live socket
  //      subscription only sees events from now on; this fills in the gap.
  //   2. History replay — expanding a completed command in the history
  //      list lazy-fetches its events to render the timeline.
  //
  // Returns an empty array (not 404) when no journal exists. Non-AI
  // commands and rows that predate the events feature have no journal —
  // the client treats empty as "use the legacy raw output instead."
  router.get('/:id/events', (req, res) => {
    const id = parseInt(req.params['id'] ?? '', 10)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid execution id' })
      return
    }
    try {
      const events = readEventJournal(ocrDir, id)
      res.json({ execution_id: id, events })
    } catch (err) {
      console.error(`Failed to read events for execution ${id}:`, err)
      res.status(500).json({ error: 'Failed to read event journal' })
    }
  })

  return router
}
