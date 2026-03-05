/**
 * Command execution endpoints.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import { getCommandHistory } from '../db.js'
import { getActiveCommands } from '../socket/command-runner.js'

interface CommandDefinition {
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

export function createCommandsRouter(db: Database): Router {
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
      res.status(500).json({ error: 'Failed to fetch command history', detail: String(err) })
    }
  })

  return router
}
